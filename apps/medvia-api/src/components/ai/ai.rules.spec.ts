import { Language } from '../../libs/enums/common.enum';
import {
	parseFaceAnalysis,
	checkProvider,
	extractJson,
	parseSummary,
	parseTranslation,
	translationCacheKey,
} from './ai.rules';

describe('checkProvider — the boot-time lock', () => {
	it('defaults to the fake provider', () => {
		expect(checkProvider({})).toBe('fake');
	});

	it('accepts a demo provider outside production', () => {
		expect(checkProvider({ AI_PROVIDER: 'openrouter', OPENROUTER_API_KEY: 'k' })).toBe(
			'openrouter',
		);
	});

	it.each(['fake', 'openrouter'])('refuses %s in production', (AI_PROVIDER) => {
		expect(() =>
			checkProvider({ NODE_ENV: 'production', AI_PROVIDER, OPENROUTER_API_KEY: 'k' }),
		).toThrow('is not allowed in production');
	});

	it('accepts openrouter in production only on a demo site (DEMO_MODE=true)', () => {
		expect(
			checkProvider({
				NODE_ENV: 'production',
				DEMO_MODE: 'true',
				AI_PROVIDER: 'openrouter',
				OPENROUTER_API_KEY: 'k',
			}),
		).toBe('openrouter');
		expect(() =>
			checkProvider({
				NODE_ENV: 'production',
				DEMO_MODE: 'false',
				AI_PROVIDER: 'openrouter',
				OPENROUTER_API_KEY: 'k',
			}),
		).toThrow('DEMO_MODE=true');
	});

	it('refuses fake in production even on a demo site', () => {
		expect(() =>
			checkProvider({ NODE_ENV: 'production', DEMO_MODE: 'true', AI_PROVIDER: 'fake' }),
		).toThrow('is not allowed in production');
	});

	it('runs anthropic in production', () => {
		expect(
			checkProvider({ NODE_ENV: 'production', AI_PROVIDER: 'anthropic', ANTHROPIC_API_KEY: 'k' }),
		).toBe('anthropic');
	});

	it('needs the key of the chosen provider', () => {
		expect(() => checkProvider({ AI_PROVIDER: 'openrouter' })).toThrow(
			'OPENROUTER_API_KEY is missing',
		);
		expect(() => checkProvider({ AI_PROVIDER: 'anthropic' })).toThrow(
			'ANTHROPIC_API_KEY is missing',
		);
	});

	it('refuses an unknown provider', () => {
		expect(() => checkProvider({ AI_PROVIDER: 'gpt' })).toThrow('AI_PROVIDER must be one of');
	});
});

describe('parsing a model reply', () => {
	it('reads plain JSON', () => {
		expect(parseTranslation('{"sourceLang": "RU", "text": "안녕하세요!"}')).toEqual({
			sourceLang: Language.RU,
			text: '안녕하세요!',
		});
	});

	it('reads JSON wrapped in fences and prose', () => {
		const reply = 'Here it is:\n```json\n{"sourceLang": "uz", "text": "Hello"}\n```';
		expect(parseTranslation(reply)).toEqual({ sourceLang: Language.UZ, text: 'Hello' });
	});

	it.each([
		['no JSON', 'Sure! Hello'],
		['an unknown language', '{"sourceLang": "FR", "text": "Bonjour"}'],
		['an empty text', '{"sourceLang": "EN", "text": "  "}'],
		['a missing field', '{"sourceLang": "EN"}'],
	])('refuses %s', (_name, reply) => {
		expect(() => parseTranslation(reply)).toThrow();
	});

	it('reads a summary and refuses an empty one', () => {
		expect(parseSummary('{"summaryKo": "30대 여성. 색소침착 2년."}')).toBe(
			'30대 여성. 색소침착 2년.',
		);
		expect(() => parseSummary('{"summaryKo": ""}')).toThrow();
	});

	it('extracts the outermost object', () => {
		expect(extractJson('x {"a": {"b": 1}} y')).toEqual({ a: { b: 1 } });
	});
});

describe('translationCacheKey', () => {
	it('is stable, differs by target language, and carries no text', () => {
		const key = translationCacheKey('Спасибо!', Language.KO);
		expect(key).toBe(translationCacheKey('Спасибо!', Language.KO));
		expect(key).not.toBe(translationCacheKey('Спасибо!', Language.EN));
		expect(key).toMatch(/^ai:translation:[0-9a-f]{64}$/);
	});
});

describe('parseFaceAnalysis', () => {
	const ok = (extra: object = {}) => ({
		qualityIssues: [],
		findings: [{ concern: 'ACNE', severity: 'MILD', zone: 'CHEEKS' }],
		summary: 'Mild acne on the cheeks.',
		...extra,
	});

	it('accepts a valid reading, also inside ```json fences', () => {
		expect(parseFaceAnalysis('```json\n' + JSON.stringify(ok()) + '\n```')).toEqual(ok());
	});

	it('drops unknown codes — a disease name never reaches the database', () => {
		const out = parseFaceAnalysis(
			ok({
				findings: [
					{ concern: 'MELANOMA', severity: 'SEVERE', zone: 'NOSE' },
					{ concern: 'ACNE', severity: 'MILD', zone: 'CHEEKS' },
				],
			}),
		);
		expect(out.findings.map((f) => f.concern)).toEqual(['ACNE']);
	});

	it('keeps one finding per concern, the most severe', () => {
		const out = parseFaceAnalysis(
			ok({
				findings: [
					{ concern: 'ACNE', severity: 'MILD', zone: 'CHEEKS' },
					{ concern: 'ACNE', severity: 'SEVERE', zone: 'CHIN' },
				],
			}),
		);
		expect(out.findings).toEqual([{ concern: 'ACNE', severity: 'SEVERE', zone: 'CHIN' }]);
	});

	it('an unknown zone becomes WHOLE_FACE instead of failing the scan', () => {
		const out = parseFaceAnalysis(
			ok({ findings: [{ concern: 'REDNESS', severity: 'MILD', zone: 'EAR' }] }),
		);
		expect(out.findings[0].zone).toBe('WHOLE_FACE');
	});

	it('a photo with quality issues carries no findings', () => {
		const out = parseFaceAnalysis(ok({ qualityIssues: ['LOW_LIGHT', 'LOW_LIGHT'] }));
		expect(out).toMatchObject({ qualityIssues: ['LOW_LIGHT'], findings: [] });
	});

	it('caps the findings at six', () => {
		const concerns = [
			'ACNE',
			'REDNESS',
			'PIGMENTATION',
			'WRINKLES',
			'DARK_CIRCLES',
			'ENLARGED_PORES',
			'SEE_DOCTOR',
		];
		const out = parseFaceAnalysis(
			ok({ findings: concerns.map((concern) => ({ concern, severity: 'MILD', zone: 'CHEEKS' })) }),
		);
		expect(out.findings).toHaveLength(6);
	});

	it.each([
		['empty', ''],
		['oversized', 'x'.repeat(801)],
	])('refuses an %s summary', (_n, summary) => {
		expect(() => parseFaceAnalysis(ok({ summary }))).toThrow('summary');
	});
});
