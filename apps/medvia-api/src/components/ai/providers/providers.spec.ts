import Anthropic from '@anthropic-ai/sdk';
import { Language } from '../../../libs/enums/common.enum';
import { AnthropicProvider } from './anthropic.provider';
import { FAKE_FAIL_MARKER, FakeProvider } from './fake.provider';
import { OpenRouterProvider, RETRY_DELAYS_MS } from './openrouter.provider';

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
	const models = {
		translateModel: 'claude-haiku-4-5',
		summaryModel: 'claude-opus-5-5',
		assistantModel: 'claude-opus-5-5',
	};

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
			assistantModel: 'claude-opus-5-5',
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
	const config = {
		apiKey: 'sk-or-test',
		translateModel: 'free/model',
		summaryModel: 'free/model',
		assistantModel: 'free/tool-model',
	};

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
			status: 500,
			json: async () => ({ echo: 'patient text' }),
		})) as unknown as typeof fetch;
		const error = await new OpenRouterProvider({ ...config, fetchFn })
			.translate('x', Language.KO)
			.catch((e: Error) => e);
		expect((error as Error).message).toBe('openrouter responded 500');
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

/* ───────────────────────── the assistant (AI-2): one step per provider ───────────────────────── */

const TOOLS = [
	{
		name: 'find_slots',
		description: 'Free times',
		parameters: {
			type: 'object',
			additionalProperties: false,
			properties: { treatmentId: { type: 'string' } },
			required: ['treatmentId'],
		},
	},
];
const HISTORY = [
	{ role: 'user' as const, text: 'laser' },
	{
		role: 'assistant' as const,
		text: '',
		toolCalls: [{ id: 't1', name: 'find_slots', args: { treatmentId: 'x' } }],
	},
	{
		role: 'tool' as const,
		results: [{ callId: 't1', name: 'find_slots', content: '{"slots":[]}' }],
	},
];

describe('OpenRouterProvider.converse', () => {
	const config = {
		apiKey: 'k',
		translateModel: 'm',
		summaryModel: 'm',
		assistantModel: 'free/tool-model',
	};
	const withReply = (message: unknown, finish = 'tool_calls') => {
		const sent: any[] = [];
		const fetchFn = (async (_u: string, init: any) => (
			sent.push(JSON.parse(init.body)),
			{ ok: true, json: async () => ({ choices: [{ message, finish_reason: finish }] }) }
		)) as unknown as typeof fetch;
		return { provider: new OpenRouterProvider({ ...config, fetchFn }), sent };
	};

	it('sends tools as functions and the history as OpenAI messages', async () => {
		const { provider, sent } = withReply({ content: 'No free time.', tool_calls: [] }, 'stop');
		const step = await provider.converse('SYSTEM', HISTORY, TOOLS);
		const body = sent[0];
		expect(body.model).toBe('free/tool-model');
		expect('tool_choice' in body).toBe(false);
		expect(body.tools[0]).toEqual({
			type: 'function',
			function: { name: 'find_slots', description: 'Free times', parameters: TOOLS[0].parameters },
		});
		expect(body.messages.map((m: any) => m.role)).toEqual(['system', 'user', 'assistant', 'tool']);
		expect(body.messages[2].tool_calls[0].function).toEqual({
			name: 'find_slots',
			arguments: '{"treatmentId":"x"}',
		});
		expect(body.messages[3]).toEqual({ role: 'tool', tool_call_id: 't1', content: '{"slots":[]}' });
		expect(step).toEqual({ text: 'No free time.', toolCalls: [], stop: 'end' });
	});

	it('parses tool calls, and turns broken JSON arguments into argsError', async () => {
		const { provider } = withReply({
			content: null,
			tool_calls: [
				{ id: 'a', function: { name: 'find_slots', arguments: '{"treatmentId":"y"}' } },
				{ id: 'b', function: { name: 'find_slots', arguments: '{treatmentId: y' } },
			],
		});
		const step = await provider.converse('S', [{ role: 'user', text: 'hi' }], TOOLS);
		expect(step.stop).toBe('tool_use');
		expect(step.toolCalls[0]).toEqual({ id: 'a', name: 'find_slots', args: { treatmentId: 'y' } });
		expect(step.toolCalls[1].argsError).toBe('the arguments are not valid JSON');
	});
});

describe('AnthropicProvider.converse', () => {
	const config = {
		translateModel: 'claude-haiku-4-5',
		summaryModel: 'claude-opus-5-5',
		assistantModel: 'claude-opus-5-5',
	};
	const content = [
		{ type: 'thinking', thinking: '', signature: 'sig' },
		{ type: 'tool_use', id: 'tu1', name: 'find_slots', input: { treatmentId: 'z' } },
	];

	it('strict tools, auto choice, a cached system prompt, low effort and fallbacks on Opus 5.5', async () => {
		const { client, calls } = fakeClient({ stop_reason: 'tool_use', content });
		const step = await new AnthropicProvider({ ...config, client }).converse(
			'SYSTEM',
			HISTORY,
			TOOLS,
		);
		const sent = calls.beta[0];
		expect(sent.model).toBe('claude-opus-5-5');
		expect(sent.tools[0]).toEqual({
			name: 'find_slots',
			description: 'Free times',
			input_schema: TOOLS[0].parameters,
			strict: true,
		});
		expect(sent.tool_choice).toEqual({ type: 'auto' });
		expect(sent.system[0].cache_control).toEqual({ type: 'ephemeral' });
		expect(sent.output_config).toEqual({ effort: 'low' });
		expect([sent.betas, sent.fallbacks]).toEqual([['server-side-fallback-2026-07-01'], 'default']);
		expect(sent.messages[1].content[0]).toEqual({
			type: 'tool_use',
			id: 't1',
			name: 'find_slots',
			input: { treatmentId: 'x' },
		});
		expect(sent.messages[2].content[0]).toEqual({
			type: 'tool_result',
			tool_use_id: 't1',
			content: '{"slots":[]}',
		});
		expect(step).toEqual({
			text: '',
			toolCalls: [{ id: 'tu1', name: 'find_slots', args: { treatmentId: 'z' } }],
			stop: 'tool_use',
			raw: content,
		});
	});

	it('sends its own earlier reply back unchanged, thinking block included', async () => {
		const { client, calls } = fakeClient({
			stop_reason: 'end_turn',
			content: [{ type: 'text', text: 'ok' }],
		});
		const history = [
			{ role: 'user' as const, text: 'laser' },
			{ role: 'assistant' as const, text: '', toolCalls: [], raw: content, provider: 'anthropic' },
		];
		await new AnthropicProvider({ ...config, client }).converse('S', history, TOOLS);
		expect(calls.beta[0].messages[1]).toEqual({ role: 'assistant', content });
	});

	it('treats a refusal as a failure', async () => {
		const { client } = fakeClient({ stop_reason: 'refusal', content: [] });
		await expect(
			new AnthropicProvider({ ...config, client }).converse('S', HISTORY, TOOLS),
		).rejects.toThrow('declined');
	});
});

describe('FakeProvider.converse — the scripted assistant', () => {
	const fake = new FakeProvider();
	const tool = (name: string, content: unknown) => ({
		role: 'tool' as const,
		results: [{ callId: 'x', name, content: JSON.stringify(content) }],
	});

	it('plays search → slots → answer', async () => {
		const first = await fake.converse(
			'S',
			[{ role: 'user', text: 'Need "Laser Toning" in Gangnam with an Uzbek interpreter' }],
			[],
		);
		expect(first.toolCalls[0]).toMatchObject({
			name: 'search_clinics',
			args: { text: 'Laser Toning', district: 'GANGNAM', language: Language.UZ, interpreter: true },
		});
		const second = await fake.converse(
			'S',
			[
				{ role: 'user', text: 'x' },
				tool('search_clinics', { clinics: [{ treatments: [{ treatmentId: 't9' }] }] }),
			],
			[],
		);
		expect(second.toolCalls[0]).toMatchObject({
			name: 'find_slots',
			args: { treatmentId: 't9', days: 7 },
		});
		const third = await fake.converse(
			'S',
			[{ role: 'user', text: 'x' }, tool('find_slots', { slots: [{ label: 'Mon 10:00' }] })],
			[],
		);
		expect([third.stop, third.text]).toEqual([
			'end',
			'[fake] Free times: Mon 10:00. Say "book" to hold the first one.',
		]);
	});

	it('proposes the last slot it was shown when asked to book', async () => {
		const slot = {
			treatmentId: 't',
			doctorId: 'd',
			slotStart: '2026-10-12T01:00:00.000Z',
			label: 'L',
		};
		const step = await fake.converse(
			'S',
			[tool('find_slots', { slots: [slot] }), { role: 'user', text: 'book it' }],
			[],
		);
		expect(step.toolCalls[0]).toMatchObject({
			name: 'propose_hold',
			args: { treatmentId: 't', doctorId: 'd', slotStart: slot.slotStart },
		});
	});
});

describe('OpenRouterProvider — a busy free model', () => {
	const config = {
		apiKey: 'k',
		translateModel: 'm',
		summaryModel: 'm',
		assistantModel: 'free/tool-model',
	};
	const saved = [...RETRY_DELAYS_MS];
	beforeAll(() => RETRY_DELAYS_MS.splice(0, 2, 1, 1));
	afterAll(() => RETRY_DELAYS_MS.splice(0, 2, ...saved));

	const answering = (statuses: number[]) => {
		let i = 0;
		const fetchFn = (async () => {
			const status = statuses[Math.min(i++, statuses.length - 1)];
			return {
				ok: status === 200,
				status,
				headers: { get: () => null },
				json: async () => ({
					choices: [{ message: { content: 'ok', tool_calls: [] }, finish_reason: 'stop' }],
				}),
			};
		}) as unknown as typeof fetch;
		return { provider: new OpenRouterProvider({ ...config, fetchFn }), calls: () => i };
	};

	it('retries a 429 and succeeds', async () => {
		const { provider, calls } = answering([429, 503, 200]);
		await expect(provider.converse('S', [{ role: 'user', text: 'hi' }], [])).resolves.toMatchObject(
			{ text: 'ok' },
		);
		expect(calls()).toBe(3);
	});

	it('gives up after two retries', async () => {
		const { provider, calls } = answering([429]);
		await expect(provider.converse('S', [{ role: 'user', text: 'hi' }], [])).rejects.toThrow(
			'openrouter responded 429',
		);
		expect(calls()).toBe(3);
	});

	it('never retries a 401', async () => {
		const { provider, calls } = answering([401]);
		await expect(provider.converse('S', [{ role: 'user', text: 'hi' }], [])).rejects.toThrow('401');
		expect(calls()).toBe(1);
	});
});
