import { T } from '../../libs/types/common';

/**
 * The edit rules of a live treatment, as pure functions: no database, no Nest, no clock unless
 * passed in. The service decides *when* to call them and writes the result; these decide *what*
 * changes. Kept apart so every combination can be unit-tested in milliseconds.
 */

/** Covered by medical-ad rules → reviewed. Price is handled separately (only a decrease waits). */
export const DRAFT_FIELDS = [
	'treatmentName',
	'treatmentCategory',
	'treatmentPriceNote',
	'treatmentDesc',
	'treatmentImages',
] as const;

/** Operational: no advertising claim in them, so they apply immediately. */
export const DIRECT_FIELDS = ['treatmentDuration', 'treatmentLangs', 'treatmentAftercare'] as const;

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export interface LiveEditPlan {
	set: T;
	unset: T;
}

/**
 * What an edit of a live (ACTIVE / HIDDEN) treatment changes.
 * - operational fields → `set` at once;
 * - medical-ad fields → into the draft; a value equal to the live one is dropped from the
 *   draft (the clinic undid its edit);
 * - price: higher → `set` at once and any waiting lower price leaves the draft; lower → draft;
 * - an empty draft is removed; fields the input does not mention leave the draft untouched.
 */
export function planLiveEdit(current: T, fields: T, now: Date = new Date()): LiveEditPlan {
	const set: T = {};
	const unset: T = {};
	for (const key of DIRECT_FIELDS) if (fields[key] !== undefined) set[key] = fields[key];

	const draft: T = { ...(current.treatmentDraft ?? {}) };
	delete draft.submittedAt;
	let touched = false;

	for (const key of DRAFT_FIELDS) {
		if (fields[key] === undefined) continue;
		touched = true;
		if (same(fields[key], current[key])) delete draft[key];
		else draft[key] = fields[key];
	}

	if (fields.treatmentPrice !== undefined) {
		touched = true;
		if (fields.treatmentPrice >= current.treatmentPrice) {
			if (fields.treatmentPrice !== current.treatmentPrice)
				set.treatmentPrice = fields.treatmentPrice;
			delete draft.treatmentPrice;
		} else {
			draft.treatmentPrice = fields.treatmentPrice;
		}
	}

	if (touched) {
		if (Object.keys(draft).length) set.treatmentDraft = { ...draft, submittedAt: now };
		else if (current.treatmentDraft) unset.treatmentDraft = 1;
	}
	return { set, unset };
}
