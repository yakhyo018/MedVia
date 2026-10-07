import { registerEnumType } from '@nestjs/graphql';

/**
 * PENDING ──► ACTIVE | EDIT_REQUESTED | HIDDEN   (admin)
 * EDIT_REQUESTED ──► PENDING                      (the patient edits)
 * ACTIVE ──► PENDING                              (the patient edits a published review)
 * ACTIVE ◄──► HIDDEN                              (admin)
 * any ──► DELETE                                  (the patient; final — no second review)
 *
 * Only ACTIVE reviews are public and count in the rating.
 */
export enum ReviewStatus {
	PENDING = 'PENDING',
	ACTIVE = 'ACTIVE',
	EDIT_REQUESTED = 'EDIT_REQUESTED',
	HIDDEN = 'HIDDEN',
	DELETE = 'DELETE',
}
registerEnumType(ReviewStatus, { name: 'ReviewStatus' });

/** The chips on "Write a verified review". */
export enum ReviewTag {
	EXPLANATION = 'EXPLANATION',
	PRICE_MATCHED = 'PRICE_MATCHED',
	INTERPRETER = 'INTERPRETER',
	CLEANLINESS = 'CLEANLINESS',
}
registerEnumType(ReviewTag, { name: 'ReviewTag' });

/** Medical-ad problems the admin names when asking for an edit or hiding a review. */
export enum ReviewFlag {
	GUARANTEED_RESULT = 'GUARANTEED_RESULT',
	SUPERLATIVE_CLAIM = 'SUPERLATIVE_CLAIM',
	PRICE_DISPUTE = 'PRICE_DISPUTE',
	BEFORE_AFTER_PHOTO = 'BEFORE_AFTER_PHOTO',
	CLINIC_COMPARISON = 'CLINIC_COMPARISON',
	PERSONAL_DATA = 'PERSONAL_DATA',
}
registerEnumType(ReviewFlag, { name: 'ReviewFlag' });

/** Who wrote the public reply: the clinic account or the doctor of the visit. */
export enum ReplierType {
	CLINIC = 'CLINIC',
	DOCTOR = 'DOCTOR',
}
registerEnumType(ReplierType, { name: 'ReplierType' });
