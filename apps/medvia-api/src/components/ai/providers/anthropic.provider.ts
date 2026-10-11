import Anthropic from '@anthropic-ai/sdk';
import { Language } from '../../../libs/enums/common.enum';
import { parseSummary, parseTranslation } from '../ai.rules';
import {
	SUMMARY_SCHEMA,
	SUMMARY_SYSTEM,
	summaryUser,
	TRANSLATE_SYSTEM,
	TRANSLATION_SCHEMA,
	translateUser,
} from '../ai.prompts';
import {
	AgentMessage,
	AgentStep,
	AgentToolCall,
	AgentToolSpec,
	AiProvider,
	QuestionAnswer,
	TranslationResult,
} from '../ai.types';

/** Models that accept server-side refusal fallbacks in their "default" form. */
const FALLBACK_MODELS = [
	'claude-opus-5-5',
	'claude-opus-5',
	'claude-fable-5-1',
	'claude-sonnet-5-5',
];

export interface AnthropicConfig {
	apiKey?: string;
	translateModel: string;
	summaryModel: string;
	assistantModel: string;
	/** Injected so a test can check the requests without a key or a network. */
	client?: Anthropic;
}

/**
 * The production provider. Structured outputs (`output_config.format`) make the reply match
 * the JSON schema; the reply is still parsed and checked, because a refusal or a cut-off
 * (`max_tokens`) can break it.
 *
 * Chat translation runs on a small, fast model (claude-haiku-4-5 by default): a short message,
 * many of them, latency on screen. The questionnaire summary runs on claude-opus-5-5 at low
 * effort: once per booking, read by a doctor. Haiku takes no `effort`; Opus 5.5 gets
 * `fallbacks: "default"`, so a safety decline is re-run on another model inside the same call.
 *
 * Unverified against the live API until a Console key exists — the request shapes are covered
 * by anthropic.provider.spec.ts with an injected client.
 */
export class AnthropicProvider implements AiProvider {
	public readonly name = 'anthropic' as const;
	private readonly client: Anthropic;

	constructor(private readonly config: AnthropicConfig) {
		this.client =
			config.client ?? new Anthropic({ apiKey: config.apiKey, timeout: 20_000, maxRetries: 2 });
	}

	public async translate(text: string, target: Language): Promise<TranslationResult> {
		const response = await this.client.messages.create({
			model: this.config.translateModel,
			max_tokens: 1024,
			system: TRANSLATE_SYSTEM,
			messages: [{ role: 'user', content: translateUser(text, target) }],
			output_config: { format: { type: 'json_schema', schema: TRANSLATION_SCHEMA } },
		});
		return parseTranslation(this.textOf(response));
	}

	public async summarize(answers: QuestionAnswer[]): Promise<string> {
		const model = this.config.summaryModel;
		const params: Record<string, unknown> = {
			model,
			max_tokens: 2048,
			system: SUMMARY_SYSTEM,
			messages: [{ role: 'user', content: summaryUser(answers) }],
			output_config: {
				format: { type: 'json_schema', schema: SUMMARY_SCHEMA },
				// Haiku 4.5 rejects `effort`; the larger models run this short task at low effort.
				...(model.includes('haiku') ? {} : { effort: 'low' }),
			},
		};
		if (FALLBACK_MODELS.includes(model)) {
			params.betas = ['server-side-fallback-2026-07-01'];
			params.fallbacks = 'default';
		}
		// The beta surface carries `fallbacks`; the SDK's typings may lag the newest params.
		const response = await this.client.beta.messages.create(params as never);
		return parseSummary(this.textOf(response as unknown as Anthropic.Message));
	}

	/**
	 * One assistant step with Anthropic tool use. The paid path that proves the design: same
	 * tools, same loop, different wire format. Tools are `strict` (the input always matches the
	 * schema), `tool_choice` stays `auto` (forcing a tool is a 400 on Opus 5.5), and the system
	 * prompt carries a cache breakpoint, so tools + system are read from the cache on every step.
	 * The reply's content blocks — thinking included — are returned as `raw`, to be sent back
	 * unchanged on the next step: an edited history would invalidate the thinking.
	 */
	public async converse(
		system: string,
		messages: AgentMessage[],
		tools: AgentToolSpec[],
	): Promise<AgentStep> {
		const model = this.config.assistantModel;
		const params: Record<string, unknown> = {
			model,
			max_tokens: 4096,
			system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
			tools: tools.map((t) => ({
				name: t.name,
				description: t.description,
				input_schema: t.parameters,
				strict: true,
			})),
			tool_choice: { type: 'auto' },
			messages: messages.map(toAnthropic),
			...(model.includes('haiku') ? {} : { output_config: { effort: 'low' } }),
		};
		if (FALLBACK_MODELS.includes(model)) {
			params.betas = ['server-side-fallback-2026-07-01'];
			params.fallbacks = 'default';
		}
		const response = (await this.client.beta.messages.create(
			params as never,
		)) as unknown as Anthropic.Message;
		if (response.stop_reason === 'refusal') throw new Error('the model declined the request');

		const toolCalls: AgentToolCall[] = response.content
			.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')
			.map((b) => ({ id: b.id, name: b.name, args: b.input }));
		const text = response.content
			.filter((b): b is Anthropic.TextBlock => b.type === 'text')
			.map((b) => b.text)
			.join('');
		const stop =
			response.stop_reason === 'max_tokens' ? 'max_tokens' : toolCalls.length ? 'tool_use' : 'end';
		return { text, toolCalls, stop, raw: response.content };
	}

	/** The text block — not content[0]: newer models put (empty) thinking blocks first. */
	private textOf(response: Anthropic.Message): string {
		if (response.stop_reason === 'refusal') throw new Error('the model declined the request');
		if (response.stop_reason === 'max_tokens') throw new Error('the reply was cut off');
		const block = response.content.find((b) => b.type === 'text');
		if (!block || block.type !== 'text') throw new Error('no text in the reply');
		return block.text;
	}
}

/**
 * MedVia's conversation → Messages API turns. An assistant turn that came from Anthropic is
 * sent back as its original blocks; one from another provider is rebuilt from text + calls.
 * Tool results go back in a user turn, all results of one step in one message.
 */
function toAnthropic(m: AgentMessage): Anthropic.MessageParam {
	if (m.role === 'user') return { role: 'user', content: m.text };
	if (m.role === 'tool') {
		return {
			role: 'user',
			content: m.results.map((r) => ({
				type: 'tool_result' as const,
				tool_use_id: r.callId,
				content: r.content,
				...(r.isError ? { is_error: true } : {}),
			})),
		};
	}
	if (m.provider === 'anthropic' && Array.isArray(m.raw)) {
		return { role: 'assistant', content: m.raw as Anthropic.ContentBlockParam[] };
	}
	const content: Anthropic.ContentBlockParam[] = [];
	if (m.text) content.push({ type: 'text', text: m.text });
	for (const c of m.toolCalls) {
		content.push({
			type: 'tool_use',
			id: c.id,
			name: c.name,
			input: (c.args ?? {}) as Record<string, unknown>,
		});
	}
	return { role: 'assistant', content: content.length ? content : [{ type: 'text', text: '…' }] };
}
