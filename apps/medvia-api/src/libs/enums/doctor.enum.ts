import { registerEnumType } from '@nestjs/graphql';

/**
 * ACTIVE ◄──► HIDDEN      (the clinic)
 * ACTIVE ◄──► SUSPENDED   (an admin — the clinic cannot undo it)
 * DELETE                  (the clinic; the doctor's account closes with it)
 *
 * A doctor is public only while both the doctor and their clinic are ACTIVE.
 */
export enum DoctorStatus {
	ACTIVE = 'ACTIVE',
	HIDDEN = 'HIDDEN',
	SUSPENDED = 'SUSPENDED',
	DELETE = 'DELETE',
}
registerEnumType(DoctorStatus, { name: 'DoctorStatus' });
