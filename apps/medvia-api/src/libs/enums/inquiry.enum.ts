import { registerEnumType } from '@nestjs/graphql';

/** The CS tabs; also the FAQ filter. */
export enum InquiryCategory {
	BOOKING = 'BOOKING',
	PAYMENT = 'PAYMENT',
	INTERPRETER = 'INTERPRETER',
	MEDICAL_DATA = 'MEDICAL_DATA',
	ACCOUNT = 'ACCOUNT',
}
registerEnumType(InquiryCategory, { name: 'InquiryCategory' });

/**
 * NEW ──► ANSWERED            (the team replies)
 * ANSWERED ──► IN_PROGRESS    (the patient writes again)
 * IN_PROGRESS ──► ANSWERED    (the team replies)
 * any but RESOLVED ──► RESOLVED (the team or the patient) — final, the thread closes
 *
 * The full table is INQUIRY_MOVES in cs.rules.ts.
 */
export enum InquiryStatus {
	NEW = 'NEW',
	IN_PROGRESS = 'IN_PROGRESS',
	ANSWERED = 'ANSWERED',
	RESOLVED = 'RESOLVED',
}
registerEnumType(InquiryStatus, { name: 'InquiryStatus' });

/** Who wrote a message in the thread: the patient or the MedVia team. */
export enum InquirySender {
	PATIENT = 'PATIENT',
	ADMIN = 'ADMIN',
}
registerEnumType(InquirySender, { name: 'InquirySender' });
