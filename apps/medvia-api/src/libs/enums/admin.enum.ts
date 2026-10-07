import { registerEnumType } from '@nestjs/graphql';

/** One value per admin decision. Treatment, review, article and member actions join later. */
export enum AuditAction {
	CLINIC_APPROVE = 'CLINIC_APPROVE',
	CLINIC_REQUEST_CHANGES = 'CLINIC_REQUEST_CHANGES',
	CLINIC_REJECT = 'CLINIC_REJECT',
	CLINIC_SUSPEND = 'CLINIC_SUSPEND',
	CLINIC_RESTORE = 'CLINIC_RESTORE',
	DOCTOR_SUSPEND = 'DOCTOR_SUSPEND',
	DOCTOR_RESTORE = 'DOCTOR_RESTORE',
	TREATMENT_APPROVE = 'TREATMENT_APPROVE',
	TREATMENT_REQUEST_CHANGES = 'TREATMENT_REQUEST_CHANGES',
	TREATMENT_REJECT = 'TREATMENT_REJECT',
	TREATMENT_EDIT_APPROVE = 'TREATMENT_EDIT_APPROVE',
	TREATMENT_EDIT_REJECT = 'TREATMENT_EDIT_REJECT',
	BOOKING_CANCEL = 'BOOKING_CANCEL',
}
registerEnumType(AuditAction, { name: 'AuditAction' });

export enum AuditGroup {
	CLINIC = 'CLINIC',
	DOCTOR = 'DOCTOR',
	TREATMENT = 'TREATMENT',
	BOOKING = 'BOOKING',
}
registerEnumType(AuditGroup, { name: 'AuditGroup' });

/** The three buttons on every admin review page — clinics and treatments. */
export enum ReviewDecision {
	APPROVE = 'APPROVE',
	REQUEST_CHANGES = 'REQUEST_CHANGES',
	REJECT = 'REJECT',
}
registerEnumType(ReviewDecision, { name: 'ReviewDecision' });
