import { registerEnumType } from '@nestjs/graphql';

export enum MemberType {
	USER = 'USER', // patient
	AGENT = 'AGENT', // clinic account
	DOCTOR = 'DOCTOR', // created by a clinic
	ADMIN = 'ADMIN', // created by `npm run seed:admin`, never through signup
}
registerEnumType(MemberType, { name: 'MemberType' });

/**
 * The only role the generic signup creates. A clinic account comes with its clinic
 * through `signupClinic`, in one transaction — never as an AGENT without a clinic.
 */
export const SIGNUP_MEMBER_TYPES = [MemberType.USER];

/** Who can be followed: community authors, doctors and clinics — never an admin. */
export const FOLLOWABLE_MEMBER_TYPES = [MemberType.USER, MemberType.DOCTOR, MemberType.AGENT];

export enum MemberStatus {
	ACTIVE = 'ACTIVE',
	BLOCK = 'BLOCK',
	DELETE = 'DELETE',
}
registerEnumType(MemberStatus, { name: 'MemberStatus' });

/** How the account was created — not which sign-in methods it has now. */
export enum MemberAuthType {
	EMAIL = 'EMAIL',
	GOOGLE = 'GOOGLE',
}
registerEnumType(MemberAuthType, { name: 'MemberAuthType' });
