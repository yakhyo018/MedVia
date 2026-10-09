import { createHash } from 'crypto';
import { Language } from '../../libs/enums/common.enum';
import { T } from '../../libs/types/common';
import { PROVIDER_NAMES, ProviderName, TranslationResult } from './ai.types';

/**
 * Pure rules of the AI layer: which provider may run where, how a model's reply is checked,
 * how a translation is cached. No network, no Nest.
 */

export const TRANSLATION_TTL_SECONDS = 30 * 24 * 60 * 60;
const MAX_TRANSLATION = 4000;
const MAX_SUMMARY = 1500;

/**
 * The boot-time lock. Free OpenRouter endpoints may log prompts and the fake provider writes
 * nonsense, so production runs only on `anthropic`. Each provider also needs its own key.
 * Throws with a message that says what to fix — the app refuses to start.
 */
export function checkProvider(env: T): ProviderName {
	const name = (env.AI_PROVIDER || 'fake') as ProviderName;
	if (!PROVIDER_NAMES.includes(name)) {
		throw new Error(`AI_PROVIDER must be one of ${PROVIDER_NAMES.join(', ')}`);
	}
	if (env.NODE_ENV === 'production' && name !== 'anthropic') {
		throw new Error(
			`AI_PROVIDER=${name} is not allowed in production: patient text must not reach a demo provider`,
		);
	}
	if (name === 'openrouter' && !env.OPENROUTER_API_KEY)
		throw new Error('OPENROUTER_API_KEY is missing');
	if (name === 'anthropic' && !env.ANTHROPIC_API_KEY)
		throw new Error('ANTHROPIC_API_KEY is missing');
	return name;
}

/** The JSON object in a model's reply — also when it is wrapped in ```json fences or prose. */
export function extractJson(raw: string): T {
	const start = raw.indexOf('{');
	const end = raw.lastIndexOf('}');
	if (start < 0 || end <= start) throw new Error('no JSON object in the reply');
	return JSON.parse(raw.slice(start, end + 1));
}

/** A model reply is untrusted input: the language must be one we know, the text non-empty. */
export function parseTranslation(raw: string | T): TranslationResult {
	const data = typeof raw === 'string' ? extractJson(raw) : raw;
	const sourceLang = String(data?.sourceLang ?? '').toUpperCase();
	const text = typeof data?.text === 'string' ? data.text.trim() : '';
	if (!(Object.values(Language) as string[]).includes(sourceLang)) {
		throw new Error('unknown sourceLang in the reply');
	}
	if (!text || text.length > MAX_TRANSLATION) throw new Error('empty or oversized translation');
	return { sourceLang: sourceLang as Language, text };
}

export function parseSummary(raw: string | T): string {
	const data = typeof raw === 'string' ? extractJson(raw) : raw;
	const summary = typeof data?.summaryKo === 'string' ? data.summaryKo.trim() : '';
	if (!summary || summary.length > MAX_SUMMARY) throw new Error('empty or oversized summary');
	return summary;
}

/**
 * `ai:translation:<sha256>` — the same text into the same language is translated once.
 * Hashed so the key carries no patient text and has a fixed length.
 */
export const translationCacheKey = (text: string, target: Language) =>
	`ai:translation:${createHash('sha256').update(`${target}\n${text}`).digest('hex')}`;
