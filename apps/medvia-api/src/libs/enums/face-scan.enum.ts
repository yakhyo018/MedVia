import { registerEnumType } from '@nestjs/graphql';

/**
 * PENDING ──► DONE | FAILED   (the analysis, inside one request)
 * DONE | FAILED ──► DELETE    (the patient removes it)
 */
export enum FaceScanStatus {
	PENDING = 'PENDING',
	DONE = 'DONE',
	FAILED = 'FAILED',
	DELETE = 'DELETE',
}
registerEnumType(FaceScanStatus, { name: 'FaceScanStatus' });

/**
 * What the analysis may report — cosmetic skin concerns, not diseases. SEE_DOCTOR stands for
 * "something here needs a doctor's eyes" (a mole that changed, a wound, a rash): the model is
 * never allowed to name it, because naming it would be a diagnosis.
 */
export enum SkinConcern {
	ACNE = 'ACNE',
	REDNESS = 'REDNESS',
	PIGMENTATION = 'PIGMENTATION',
	WRINKLES = 'WRINKLES',
	DARK_CIRCLES = 'DARK_CIRCLES',
	ENLARGED_PORES = 'ENLARGED_PORES',
	SEE_DOCTOR = 'SEE_DOCTOR',
}
registerEnumType(SkinConcern, { name: 'SkinConcern' });

export enum ConcernSeverity {
	MILD = 'MILD',
	MODERATE = 'MODERATE',
	SEVERE = 'SEVERE',
}
registerEnumType(ConcernSeverity, { name: 'ConcernSeverity' });

/** The zones the browser (MediaPipe Face Landmarker) outlines; the model reports one of them. */
export enum FaceZone {
	FOREHEAD = 'FOREHEAD',
	EYES = 'EYES',
	NOSE = 'NOSE',
	CHEEKS = 'CHEEKS',
	CHIN = 'CHIN',
	WHOLE_FACE = 'WHOLE_FACE',
}
registerEnumType(FaceZone, { name: 'FaceZone' });

/** Why a photo could not be read. Any of these → no findings, the patient retakes the photo. */
export enum PhotoQualityIssue {
	NO_FACE = 'NO_FACE',
	MULTIPLE_FACES = 'MULTIPLE_FACES',
	LOW_LIGHT = 'LOW_LIGHT',
	BLURRY = 'BLURRY',
	BAD_ANGLE = 'BAD_ANGLE',
	MAKEUP_OR_FILTER = 'MAKEUP_OR_FILTER',
}
registerEnumType(PhotoQualityIssue, { name: 'PhotoQualityIssue' });
