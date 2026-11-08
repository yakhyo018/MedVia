import { Language } from '../../libs/enums/common.enum';
import {
	ConcernSeverity,
	FaceZone,
	PhotoQualityIssue,
	SkinConcern,
} from '../../libs/enums/face-scan.enum';

export interface TranslationResult {
	/** The language the text was actually written in, as the model detected it. */
	sourceLang: Language;
	text: string;
}

export interface QuestionAnswer {
	question: string;
	answer: string;
}

/* ───────────────────────── face scan (AI-3) ───────────────────────── */

/** A photo already checked (type from its bytes) and stripped of EXIF. Never written to disk. */
export interface FaceImage {
	data: Buffer;
	mediaType: 'image/jpeg' | 'image/png';
}

export interface FaceFinding {
	concern: SkinConcern;
	severity: ConcernSeverity;
	zone: FaceZone;
}

/** The model's reading of one photo, after parseFaceAnalysis has checked it. */
export interface FaceAnalysis {
	/** Non-empty = the photo could not be read; findings is then empty. */
	qualityIssues: PhotoQualityIssue[];
	findings: FaceFinding[];
	/** Two or three sentences for the patient, in the patient's language. Not a diagnosis. */
	summary: string;
}

/* ───────────────────────── the assistant (AI-2) ───────────────────────── */

/**
 * A tool the assistant may call, described once for every provider: OpenRouter sends it as an
 * OpenAI-style function, Anthropic as a `tool` with `input_schema`. `parameters` is JSON Schema.
 */
export interface AgentToolSpec {
	name: string;
	description: string;
	parameters: Record<string, unknown>;
}

/** One call the model asked for. `argsError` when its arguments were not even JSON. */
export interface AgentToolCall {
	id: string;
	name: string;
	args: unknown;
	argsError?: string;
}

export interface AgentToolResult {
	callId: string;
	name: string;
	/** What the model reads back: compact JSON, or an error message. */
	content: string;
	isError?: boolean;
}

/**
 * The conversation in MedVia's own shape, so a session survives a provider switch. `raw` keeps
 * a provider's original reply (Anthropic's content blocks, thinking included) to be sent back
 * unchanged to that same provider; any other provider ignores it.
 */
export type AgentMessage =
	| { role: 'user'; text: string }
	| {
			role: 'assistant';
			text: string;
			toolCalls: AgentToolCall[];
			raw?: unknown;
			provider?: string;
	  }
	| { role: 'tool'; results: AgentToolResult[] };

/** One model step: text, the tools it wants run, and why it stopped. */
export interface AgentStep {
	text: string;
	toolCalls: AgentToolCall[];
	stop: 'end' | 'tool_use' | 'max_tokens';
	raw?: unknown;
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
	/**
	 * One step of the assistant: the model sees the conversation and the tools and either
	 * answers or asks for tool calls. The loop around it (running tools, limits) is the
	 * assistant module's, not the provider's.
	 */
	converse(system: string, messages: AgentMessage[], tools: AgentToolSpec[]): Promise<AgentStep>;
	/** Visible cosmetic skin concerns in one face photo, summarised in `lang`. Not a diagnosis. */
	analyzeFace(image: FaceImage, lang: Language): Promise<FaceAnalysis>;
}

export type ProviderName = 'fake' | 'openrouter' | 'anthropic';

export const PROVIDER_NAMES: ProviderName[] = ['fake', 'openrouter', 'anthropic'];

/** DI token: interfaces do not exist at runtime, so the provider is injected by this symbol. */
export const AI_PROVIDER = Symbol('AI_PROVIDER');
