/** Navi's rules as pure functions and constants: limits, keys, where a source links to. */

/** Questions per member per minute — each one is a model call on Navi's single GPU slot. */
export const NAVI_PER_MINUTE = 10;

/** Navi answers in 0.5–5 s on an M2; past this the patient gets "not available", not a spinner. */
export const NAVI_TIMEOUT_MS = 15_000;

export const NAVI_DISCLAIMER =
	'Answers come from MedVia’s own content and may be incomplete. This is not medical advice.';

/** `navi:ask:<memberId>:<unix minute>` — an INCR counter with a 2-minute TTL. */
export const naviRateKey = (memberId: unknown, now: Date) =>
	`navi:ask:${String(memberId)}:${Math.floor(now.getTime() / 60_000)}`;

/** `clinic-<id>` → { kind: 'clinic', id }. Navi's ids are `<kind>-<rest>`; guides use a slug. */
export function parseDocId(docId: string): { kind: string; id: string } {
	const dash = docId.indexOf('-');
	if (dash <= 0) return { kind: docId, id: '' };
	return { kind: docId.slice(0, dash), id: docId.slice(dash + 1) };
}

/**
 * The page a source links to on the site. A treatment has no page of its own: it links to its
 * clinic, whose id the caller looks up (`treatmentClinic`). Guides live only in Navi — no link.
 */
export function sourceUrl(docId: string, treatmentClinic: Map<string, string>): string | undefined {
	const { kind, id } = parseDocId(docId);
	switch (kind) {
		case 'clinic':
			return id ? `/clinics/detail?id=${id}` : undefined;
		case 'treatment': {
			const clinicId = treatmentClinic.get(id);
			return clinicId ? `/clinics/detail?id=${clinicId}` : undefined;
		}
		case 'tip':
			return id ? `/community/detail?id=${id}` : undefined;
		case 'faq':
			return '/cs';
		case 'notice':
			return id ? `/cs/notice?id=${id}` : undefined;
		default:
			return undefined;
	}
}
