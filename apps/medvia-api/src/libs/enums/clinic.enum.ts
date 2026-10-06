import { registerEnumType } from '@nestjs/graphql';

/**
 * PENDING ──► ACTIVE | CHANGES_REQUESTED | REJECTED   (admin)
 * CHANGES_REQUESTED ──► PENDING                        (clinic resubmits)
 * ACTIVE ◄──► SUSPENDED                                (admin)
 * REJECTED is final.
 */
export enum ClinicStatus {
	PENDING = 'PENDING',
	ACTIVE = 'ACTIVE',
	CHANGES_REQUESTED = 'CHANGES_REQUESTED',
	REJECTED = 'REJECTED',
	SUSPENDED = 'SUSPENDED',
	DELETE = 'DELETE',
}
registerEnumType(ClinicStatus, { name: 'ClinicStatus' });

export enum Specialty {
	DERMATOLOGY = 'DERMATOLOGY',
	PLASTIC_SURGERY = 'PLASTIC_SURGERY',
	DENTAL = 'DENTAL',
	CHECK_UP = 'CHECK_UP',
}
registerEnumType(Specialty, { name: 'Specialty' });

/** Seoul districts (gu) the portfolio covers. */
export enum District {
	GANGNAM = 'GANGNAM',
	SEOCHO = 'SEOCHO',
	JUNG = 'JUNG',
	MAPO = 'MAPO',
	YONGSAN = 'YONGSAN',
	JONGNO = 'JONGNO',
	SONGPA = 'SONGPA',
}
registerEnumType(District, { name: 'District' });

/** The three buttons on the admin verification page. */
export enum ClinicDecision {
	APPROVE = 'APPROVE',
	REQUEST_CHANGES = 'REQUEST_CHANGES',
	REJECT = 'REJECT',
}
registerEnumType(ClinicDecision, { name: 'ClinicDecision' });
