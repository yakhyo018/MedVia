import { createHash } from 'crypto';
import { Language } from '../../libs/enums/common.enum';
import { T } from '../../libs/types/common';
import {
	ConcernSeverity,
	FaceZone,
	PhotoQualityIssue,
	SkinConcern,
} from '../../libs/enums/face-scan.enum';
import {
	FaceAnalysis,
	FaceFinding,
	PROVIDER_NAMES,
	ProviderName,
	TranslationResult,
} from './ai.types';

/**
 * Pure rules of the AI layer: which provider may run where, how a model's reply is checked,
 * how a translation is cached. No network, no Nest.
 */

export const TRANSLATION_TTL_SECONDS = 30 * 24 * 60 * 60;
const MAX_TRANSLATION = 4000;
const MAX_SUMMARY = 1500;
const MAX_FACE_SUMMARY = 800;
export const MAX_FACE_FINDINGS = 6;

/**
 * The boot-time lock. Free OpenRouter endpoints may log prompts and the fake provider writes
 * nonsense, so production runs only on `anthropic` — unless DEMO_MODE=true says this production
 * holds synthetic demo data only (the portfolio site), where `openrouter` is allowed too. Each
 * provider also needs its own key. Throws with a message that says what to fix — the app
 * refuses to start.
 */
export function checkProvider(env: T): ProviderName {
	const name = (env.AI_PROVIDER || 'fake') as ProviderName;
	if (!PROVIDER_NAMES.includes(name)) {
		throw new Error(`AI_PROVIDER must be one of ${PROVIDER_NAMES.join(', ')}`);
	}
	const demo = String(env.DEMO_MODE) === 'true';
	if (env.NODE_ENV === 'production' && name !== 'anthropic' && !(demo && name === 'openrouter')) {
		throw new Error(
			`AI_PROVIDER=${name} is not allowed in production: patient text must not reach a demo provider` +
				(name === 'openrouter' ? ' (set DEMO_MODE=true for a demo-data-only site)' : ''),
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

const isOneOf = <E extends Record<string, string>>(e: E, v: unknown): v is E[keyof E] =>
	typeof v === 'string' && (Object.values(e) as string[]).includes(v);

/**
 * The face reading is untrusted input like any model reply — and here a wrong value reaches a
 * patient. Unknown codes are dropped (never stored as free text), one finding per concern is
 * kept (the most severe), at most six. A photo with quality issues carries no findings: a
 * reading of a dark or blurred photo would be a guess.
 */
export function parseFaceAnalysis(raw: string | T): FaceAnalysis {
	const data = typeof raw === 'string' ? extractJson(raw) : raw;
	const summary = typeof data?.summary === 'string' ? data.summary.trim() : '';
	if (!summary || summary.length > MAX_FACE_SUMMARY) throw new Error('empty or oversized summary');

	const qualityIssues = [
		...new Set((Array.isArray(data?.qualityIssues) ? data.qualityIssues : []) as unknown[]),
	].filter((q): q is PhotoQualityIssue => isOneOf(PhotoQualityIssue, q));
	if (qualityIssues.length) return { qualityIssues, findings: [], summary };

	const rank = Object.values(ConcernSeverity);
	const byConcern = new Map<SkinConcern, FaceFinding>();
	for (const f of (Array.isArray(data?.findings) ? data.findings : []) as T[]) {
		if (!isOneOf(SkinConcern, f?.concern) || !isOneOf(ConcernSeverity, f?.severity)) continue;
		const finding: FaceFinding = {
			concern: f.concern,
			severity: f.severity,
			zone: isOneOf(FaceZone, f?.zone) ? f.zone : FaceZone.WHOLE_FACE,
		};
		const seen = byConcern.get(finding.concern);
		if (!seen || rank.indexOf(finding.severity) > rank.indexOf(seen.severity))
			byConcern.set(finding.concern, finding);
	}
	return { qualityIssues, findings: [...byConcern.values()].slice(0, MAX_FACE_FINDINGS), summary };
}

/**
 * `ai:translation:<sha256>` — the same text into the same language is translated once.
 * Hashed so the key carries no patient text and has a fixed length.
 */
export const translationCacheKey = (text: string, target: Language) =>
	`ai:translation:${createHash('sha256').update(`${target}\n${text}`).digest('hex')}`;
