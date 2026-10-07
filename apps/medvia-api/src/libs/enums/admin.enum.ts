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
}
registerEnumType(AuditAction, { name: 'AuditAction' });

export enum AuditGroup {
	CLINIC = 'CLINIC',
	DOCTOR = 'DOCTOR',
}
registerEnumType(AuditGroup, { name: 'AuditGroup' });
