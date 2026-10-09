import { Language } from '../../../libs/enums/common.enum';
import { parseSummary, parseTranslation } from '../ai.rules';
import { SUMMARY_SYSTEM, summaryUser, TRANSLATE_SYSTEM, translateUser } from '../ai.prompts';
import { AiProvider, QuestionAnswer, TranslationResult } from '../ai.types';

const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';
const TIMEOUT_MS = 20_000;

export interface OpenRouterConfig {
	apiKey: string;
	translateModel: string;
	summaryModel: string;
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

	private async complete(model: string, system: string, user: string): Promise<string> {
		const res = await this.fetchFn(ENDPOINT, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${this.config.apiKey}`,
				'Content-Type': 'application/json',
				'X-Title': 'MedVia',
			},
			body: JSON.stringify({
				model,
				temperature: 0,
				max_tokens: 1024,
				messages: [
					{ role: 'system', content: system },
					{ role: 'user', content: user },
				],
			}),
			signal: AbortSignal.timeout(TIMEOUT_MS),
		});
		// The status only — the body may echo the prompt, and the prompt is patient text.
		if (!res.ok) throw new Error(`openrouter responded ${res.status}`);
		const body: any = await res.json();
		const content = body?.choices?.[0]?.message?.content;
		if (typeof content !== 'string' || !content) throw new Error('openrouter returned no content');
		return content;
	}
}
