import { Language } from '../../libs/enums/common.enum';

export interface TranslationResult {
	/** The language the text was actually written in, as the model detected it. */
	sourceLang: Language;
	text: string;
}

export interface QuestionAnswer {
	question: string;
	answer: string;
}

/**
 * What the app needs from an AI model. The chat and booking modules call AiService, which
 * holds one of these; which one is decided by AI_PROVIDER at boot and nobody else knows.
 */
export interface AiProvider {
	readonly name: ProviderName;
	translate(text: string, target: Language): Promise<TranslationResult>;
	/** A short Korean summary of a questionnaire, for the doctor. Not a diagnosis. */
	summarize(answers: QuestionAnswer[]): Promise<string>;
}

export type ProviderName = 'fake' | 'openrouter' | 'anthropic';

export const PROVIDER_NAMES: ProviderName[] = ['fake', 'openrouter', 'anthropic'];

/** DI token: interfaces do not exist at runtime, so the provider is injected by this symbol. */
export const AI_PROVIDER = Symbol('AI_PROVIDER');
