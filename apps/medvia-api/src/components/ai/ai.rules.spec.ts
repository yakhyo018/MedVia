import { Language } from '../../libs/enums/common.enum';
import {
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
