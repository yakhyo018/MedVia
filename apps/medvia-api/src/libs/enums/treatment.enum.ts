import { registerEnumType } from '@nestjs/graphql';

/**
 * PENDING ──► ACTIVE | CHANGES_REQUESTED | REJECTED   (admin; a new treatment)
 * CHANGES_REQUESTED ──► PENDING                        (the clinic resubmits)
 * ACTIVE ◄──► HIDDEN                                   (the clinic: "Visible to patients")
 * PENDING ──► DELETE                                   (the clinic cancels before review)
 * any ──► DELETE                                       (the clinic removes it)
 *
 * An edit of a live treatment does not change the status: it waits in treatmentDraft.
 */
export enum TreatmentStatus {
	PENDING = 'PENDING',
	ACTIVE = 'ACTIVE',
	CHANGES_REQUESTED = 'CHANGES_REQUESTED',
	REJECTED = 'REJECTED',
	HIDDEN = 'HIDDEN',
	DELETE = 'DELETE',
}
registerEnumType(TreatmentStatus, { name: 'TreatmentStatus' });

export enum TreatmentCategory {
	PIGMENTATION = 'PIGMENTATION',
	ACNE = 'ACNE',
	HYDRATION = 'HYDRATION',
	ANTI_AGING = 'ANTI_AGING',
	FILLER = 'FILLER',
	DENTAL_CARE = 'DENTAL_CARE',
	CHECK_UP = 'CHECK_UP',
	CONSULTATION = 'CONSULTATION',
}
registerEnumType(TreatmentCategory, { name: 'TreatmentCategory' });
