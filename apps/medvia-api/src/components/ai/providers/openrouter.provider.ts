import { Language } from '../../../libs/enums/common.enum';
import { parseFaceAnalysis, parseSummary, parseTranslation } from '../ai.rules';
import {
	FACE_SYSTEM,
	faceUser,
	SUMMARY_SYSTEM,
	summaryUser,
	TRANSLATE_SYSTEM,
	translateUser,
} from '../ai.prompts';
import {
	AgentMessage,
	AgentStep,
	AgentToolCall,
	AgentToolSpec,
	AiProvider,
	FaceAnalysis,
	FaceImage,
	QuestionAnswer,
	TranslationResult,
} from '../ai.types';

const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';
const TIMEOUT_MS = 20_000;
/** A tool loop step can be slower than a translation: more context, a longer answer. */
const CONVERSE_TIMEOUT_MS = 45_000;
const RETRY_STATUSES = [429, 502, 503];
/** Overridable so the tests do not wait. */
export const RETRY_DELAYS_MS = [2_000, 5_000];
const MAX_RETRY_WAIT_MS = 10_000;

export interface OpenRouterConfig {
	apiKey: string;
	translateModel: string;
	summaryModel: string;
	/** A free model that supports tool calling (OpenRouter lists `tools` in its parameters). */
	assistantModel: string;
	/** A model that reads images; empty = face scans fail into FAILED, the rest still works. */
	faceModel?: string;
	/** Injected so a test can replace the network; defaults to Node's own fetch. */
	fetchFn?: typeof fetch;
}

/**
 * The demo provider: a free model through OpenRouter's OpenAI-compatible API, with Node's own
 * fetch — no SDK, no package. Free endpoints may log prompts, which is acceptable only because
 * MedVia's data is synthetic; checkProvider refuses it in production.
 *
 * Not every free model can enforce a JSON schema, so the prompt asks for JSON and the reply is
 * validated (parseTranslation); a model that answers in prose fails into FAILED, never into the chat.
 */
export class OpenRouterProvider implements AiProvider {
	public readonly name = 'openrouter' as const;
	private readonly fetchFn: typeof fetch;

	constructor(private readonly config: OpenRouterConfig) {
		this.fetchFn = config.fetchFn ?? fetch;
	}

	public async translate(text: string, target: Language): Promise<TranslationResult> {
		const reply = await this.complete(
			this.config.translateModel,
			TRANSLATE_SYSTEM,
			translateUser(text, target),
		);
		return parseTranslation(reply);
	}

	public async summarize(answers: QuestionAnswer[]): Promise<string> {
		const reply = await this.complete(
			this.config.summaryModel,
			SUMMARY_SYSTEM,
			summaryUser(answers),
		);
		return parseSummary(reply);
	}

	/**
	 * One assistant step in OpenAI's function-calling shape, which OpenRouter speaks for every
	 * model that supports tools. A free model may return broken JSON as arguments: that becomes
	 * an `argsError` on the call — the loop answers it with an error result, never runs it.
	 */
	public async converse(
		system: string,
		messages: AgentMessage[],
		tools: AgentToolSpec[],
	): Promise<AgentStep> {
		const res = await this.post(
			JSON.stringify({
				model: this.config.assistantModel,
				// 0: the same request takes the same path (measured: at 0.2 the free model's tool
				// choice varied between runs of the eval).
				temperature: 0,
				max_tokens: 1500,
				// No `tool_choice`: with tools present the default is already "auto", and some free
				// models (Inkling) list tools but not tool_choice — sending it would rule them out.
				tools: tools.map((t) => ({
					type: 'function',
					function: { name: t.name, description: t.description, parameters: t.parameters },
				})),
				messages: [{ role: 'system', content: system }, ...messages.flatMap(toOpenAi)],
			}),
			CONVERSE_TIMEOUT_MS,
		);
		if (!res.ok) throw new Error(`openrouter responded ${res.status}`);
		const body: any = await res.json();
		const choice = body?.choices?.[0];
		if (!choice?.message) throw new Error('openrouter returned no message');
		const toolCalls: AgentToolCall[] = (choice.message.tool_calls ?? []).map(
			(c: any, i: number) => {
				const call: AgentToolCall = {
					id: c.id || `call-${i}`,
					name: c.function?.name ?? '',
					args: {},
				};
				try {
					call.args = c.function?.arguments ? JSON.parse(c.function.arguments) : {};
				} catch {
					call.argsError = 'the arguments are not valid JSON';
				}
				return call;
			},
		);
		const stop =
			choice.finish_reason === 'length' ? 'max_tokens' : toolCalls.length ? 'tool_use' : 'end';
		return { text: choice.message.content ?? '', toolCalls, stop };
	}

	/**
	 * The photo as an OpenAI-style `image_url` with a data URL — the photo goes in the body,
	 * never as a public link. Free vision models cannot all enforce a schema: the JSON is asked
	 * for in the prompt and checked by parseFaceAnalysis.
	 */
	public async analyzeFace(image: FaceImage, lang: Language): Promise<FaceAnalysis> {
		if (!this.config.faceModel) throw new Error('AI_MODEL_FACE is not set');
		const dataUrl = `data:${image.mediaType};base64,${image.data.toString('base64')}`;
		const res = await this.post(
			JSON.stringify({
				model: this.config.faceModel,
				temperature: 0,
				max_tokens: 1024,
				messages: [
					{ role: 'system', content: FACE_SYSTEM },
					{
						role: 'user',
						content: [
							{ type: 'image_url', image_url: { url: dataUrl } },
							{ type: 'text', text: faceUser(lang) },
						],
					},
				],
			}),
			CONVERSE_TIMEOUT_MS,
		);
		if (!res.ok) throw new Error(`openrouter responded ${res.status}`);
		const body: any = await res.json();
		const content = body?.choices?.[0]?.message?.content;
		if (typeof content !== 'string' || !content) throw new Error('openrouter returned no content');
		return parseFaceAnalysis(content);
	}

	/**
	 * Free models share upstream capacity: a 429 (or a 502/503 from the provider behind
	 * OpenRouter) is usually gone a few seconds later. Up to two retries, waiting what
	 * Retry-After asks (capped) or 2 s then 5 s; any other status fails at once.
	 */
	private async post(body: string, timeoutMs: number): Promise<Response> {
		for (let attempt = 0; ; attempt++) {
			const res = await this.fetchFn(ENDPOINT, {
				method: 'POST',
				headers: this.headers(),
				body,
				signal: AbortSignal.timeout(timeoutMs),
			});
			if (!RETRY_STATUSES.includes(res.status) || attempt >= RETRY_DELAYS_MS.length) return res;
			const asked = Number(res.headers?.get?.('retry-after')) * 1000;
			const wait = asked > 0 ? Math.min(asked, MAX_RETRY_WAIT_MS) : RETRY_DELAYS_MS[attempt];
			await new Promise((resolve) => setTimeout(resolve, wait));
		}
	}

	private headers() {
		return {
			Authorization: `Bearer ${this.config.apiKey}`,
			'Content-Type': 'application/json',
			'X-Title': 'MedVia',
		};
	}

	private async complete(model: string, system: string, user: string): Promise<string> {
		const res = await this.post(
			JSON.stringify({
				model,
				temperature: 0,
				max_tokens: 1024,
				messages: [
					{ role: 'system', content: system },
					{ role: 'user', content: user },
				],
			}),
			TIMEOUT_MS,
		);
		// The status only — the body may echo the prompt, and the prompt is patient text.
		if (!res.ok) throw new Error(`openrouter responded ${res.status}`);
		const body: any = await res.json();
		const content = body?.choices?.[0]?.message?.content;
		if (typeof content !== 'string' || !content) throw new Error('openrouter returned no content');
		return content;
	}
}

/** MedVia's conversation → OpenAI's messages: tool results become one `tool` message each. */
function toOpenAi(m: AgentMessage): unknown[] {
	if (m.role === 'user') return [{ role: 'user', content: m.text }];
	if (m.role === 'tool') {
		return m.results.map((r) => ({ role: 'tool', tool_call_id: r.callId, content: r.content }));
	}
	return [
		{
			role: 'assistant',
			content: m.text || null,
			...(m.toolCalls.length
				? {
						tool_calls: m.toolCalls.map((c) => ({
							id: c.id,
							type: 'function',
							function: { name: c.name, arguments: JSON.stringify(c.args ?? {}) },
						})),
					}
				: {}),
		},
	];
}
