import { Types } from 'mongoose';

/**
 * The Postman helpers (test-support mutations, the batch's /dev/run). Two locks: an explicit
 * flag, and never in production even if the flag leaks there.
 */
export const testSupportEnabled = (): boolean =>
	process.env.NODE_ENV !== 'production' && process.env.ENABLE_TEST_SUPPORT === 'true';

export const availableMemberSorts = [
	'createdAt',
	'updatedAt',
	'memberFullName',
	'memberLastLoginAt',
];

export const availableClinicSorts = [
	'createdAt',
	'clinicName',
	'clinicMinPrice',
	'clinicLikes',
	'clinicFollowers',
	'clinicViews',
	'clinicRating',
	'clinicScore',
];

/** Paths our own uploader returns. Anything else — an outside URL, `javascript:` — is refused. */
export const UPLOADED_IMAGE_PATTERN = /^uploads\/[a-z]+\/[0-9a-f-]{36}\.(jpg|png)$/;

/** GraphQL hands ids over as strings; Mongo compares ObjectIds. */
export const shapeIntoMongoObjectId = (target: any) => {
	return typeof target === 'string' ? new Types.ObjectId(target) : target;
};

/**
 * Escapes user text before it goes into a RegExp. Without it, a search for "a.*"
 * matches everything, and a crafted pattern like "(a+)+$" can freeze the event loop.
 */
export const escapeRegex = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * How a member appears to other members. Patients show as "Feride K." — a medical
 * community should not expose full names; clinics and doctors are public by design.
 */
export const toDisplayName = (fullName: string, isPatient: boolean): string => {
	if (!isPatient) return fullName;
	const [first, last] = fullName.trim().split(/\s+/);
	return last ? `${first} ${last[0]}.` : first;
};

/** Cache keys, `<entity>:<scope>:<id-or-hash>`. One place, so writers and readers agree. */
export const CacheKeys = {
	clinicDetail: (clinicId: unknown) => `clinic:detail:${String(clinicId)}`,
	clinicList: (hash: string) => `clinic:list:${hash}`,
	clinicListPattern: 'clinic:list:*',
	activeClinicIds: 'clinic:active:ids',
	doctorDetail: (doctorId: unknown) => `doctor:detail:${String(doctorId)}`,
	doctorDetailPattern: 'doctor:detail:*',
	doctorList: (hash: string) => `doctor:list:${hash}`,
	doctorListPattern: 'doctor:list:*',
};

export const availableDoctorSorts = [
	'createdAt',
	'doctorName',
	'doctorLikes',
	'doctorFollowers',
	'doctorViews',
	'doctorRating',
	'doctorScore',
];

/** The text of "Allow AI translation of my chat" a patient agreed to; bump when the text changes. */
export const AI_CONSENT_VERSION = 'ai-translate-v1';

/** Community list sorts. Whitelisted: a client-chosen sort field could order by anything. */
export const availableArticleSorts = [
	'createdAt',
	'articleLikes',
	'articleViews',
	'articleComments',
];

/** Notifications are kept 90 days after their last activity, then the TTL index removes them. */
export const NOTIFICATION_TTL_SECONDS = 90 * 24 * 60 * 60;
