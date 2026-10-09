import Anthropic from '@anthropic-ai/sdk';
import { Language } from '../../../libs/enums/common.enum';
import { AnthropicProvider } from './anthropic.provider';
import { FAKE_FAIL_MARKER, FakeProvider } from './fake.provider';
import { OpenRouterProvider } from './openrouter.provider';

/** A Messages API reply as the SDK returns it: an empty thinking block first, then the text. */
const reply = (text: string, stop_reason = 'end_turn') => ({
	stop_reason,
	content: [
		{ type: 'thinking', thinking: '' },
		{ type: 'text', text },
	],
});

/** Records what the provider sends; answers with `answer`. */
function fakeClient(answer: unknown) {
	const calls: { create: any[]; beta: any[] } = { create: [], beta: [] };
	const client = {
		messages: { create: async (p: any) => (calls.create.push(p), answer) },
		beta: { messages: { create: async (p: any) => (calls.beta.push(p), answer) } },
	};
	return { client: client as unknown as Anthropic, calls };
}

describe('AnthropicProvider (request shapes, no network)', () => {
	const models = { translateModel: 'claude-haiku-4-5', summaryModel: 'claude-opus-5-5' };

	it('translates with Haiku and a JSON schema, no effort', async () => {
		const { client, calls } = fakeClient(reply('{"sourceLang":"RU","text":"안녕하세요"}'));
		const provider = new AnthropicProvider({ ...models, client });

		await expect(provider.translate('Здравствуйте', Language.KO)).resolves.toEqual({
			sourceLang: Language.RU,
			text: '안녕하세요',
		});
		const sent = calls.create[0];
		expect(sent.model).toBe('claude-haiku-4-5');
		expect(sent.output_config.format.type).toBe('json_schema');
		expect(sent.output_config.effort).toBeUndefined();
		expect(sent.messages[0].content).toContain('<message>\nЗдравствуйте\n</message>');
	});

	it('summarises with Opus 5.5 at low effort, with refusal fallbacks', async () => {
		const { client, calls } = fakeClient(reply('{"summaryKo":"30대 여성, 색소침착."}'));
		const provider = new AnthropicProvider({ ...models, client });

		await expect(
			provider.summarize([{ question: 'Concern', answer: 'Pigmentation' }]),
		).resolves.toBe('30대 여성, 색소침착.');
		const sent = calls.beta[0];
		expect(sent.model).toBe('claude-opus-5-5');
		expect(sent.output_config.effort).toBe('low');
		expect(sent.fallbacks).toBe('default');
		expect(sent.betas).toEqual(['server-side-fallback-2026-07-01']);
	});

	it('sends no effort and no fallbacks when the summary runs on Haiku', async () => {
		const { client, calls } = fakeClient(reply('{"summaryKo":"요약"}'));
		await new AnthropicProvider({
			translateModel: 'claude-haiku-4-5',
			summaryModel: 'claude-haiku-4-5',
			client,
		}).summarize([{ question: 'q', answer: 'a' }]);
		expect(calls.beta[0].output_config.effort).toBeUndefined();
		expect(calls.beta[0].fallbacks).toBeUndefined();
	});

	it.each([
		['a refusal', reply('', 'refusal'), 'declined'],
		['a cut-off reply', reply('{"sourceLang":"RU","te', 'max_tokens'), 'cut off'],
	])('fails on %s instead of reading the text', async (_name, answer, message) => {
		const { client } = fakeClient(answer);
		await expect(
			new AnthropicProvider({ ...models, client }).translate('x', Language.KO),
		).rejects.toThrow(message);
	});
});

describe('OpenRouterProvider (no network)', () => {
	const config = { apiKey: 'sk-or-test', translateModel: 'free/model', summaryModel: 'free/model' };

	it('posts an OpenAI-style chat request and validates the reply', async () => {
		let sent: any;
		const fetchFn = (async (_url: string, init: any) => {
			sent = { ...init, body: JSON.parse(init.body) };
			return {
				ok: true,
				json: async () => ({
					choices: [
						{ message: { content: '```json\n{"sourceLang":"UZ","text":"감사합니다"}\n```' } },
					],
				}),
			};
		}) as unknown as typeof fetch;

		await expect(
			new OpenRouterProvider({ ...config, fetchFn }).translate('Rahmat', Language.KO),
		).resolves.toEqual({
			sourceLang: Language.UZ,
			text: '감사합니다',
		});
		expect(sent.headers.Authorization).toBe('Bearer sk-or-test');
		expect(sent.body.model).toBe('free/model');
		expect(sent.body.temperature).toBe(0);
		expect(sent.body.messages.map((m: any) => m.role)).toEqual(['system', 'user']);
	});

	it('reports only the HTTP status on an error, never the body', async () => {
		const fetchFn = (async () => ({
			ok: false,
			status: 429,
			json: async () => ({ echo: 'patient text' }),
		})) as unknown as typeof fetch;
		await expect(
			new OpenRouterProvider({ ...config, fetchFn }).translate('x', Language.KO),
		).rejects.toThrow('openrouter responded 429');
	});

	it('fails when a free model answers in prose', async () => {
		const fetchFn = (async () => ({
			ok: true,
			json: async () => ({ choices: [{ message: { content: 'Sure! 감사합니다' } }] }),
		})) as unknown as typeof fetch;
		await expect(
			new OpenRouterProvider({ ...config, fetchFn }).translate('x', Language.KO),
		).rejects.toThrow();
	});
});

describe('FakeProvider', () => {
	const fake = new FakeProvider();

	it('is deterministic and guesses the script', async () => {
		await expect(fake.translate('Спасибо', Language.KO)).resolves.toEqual({
			sourceLang: Language.RU,
			text: '[KO] Спасибо',
		});
		await expect(fake.translate('감사합니다', Language.RU)).resolves.toEqual({
			sourceLang: Language.KO,
			text: '[RU] 감사합니다',
		});
	});

	it('fails on the marker, so the FAILED path can be tested', async () => {
		await expect(fake.translate(`hello ${FAKE_FAIL_MARKER}`, Language.KO)).rejects.toThrow();
	});
});
