import { registerEnumType } from '@nestjs/graphql';

/** What can be reported in M8: community content. Reviews have their own moderation (M6). */
export enum ReportGroup {
	ARTICLE = 'ARTICLE',
	COMMENT = 'COMMENT',
}
registerEnumType(ReportGroup, { name: 'ReportGroup' });

export enum ReportReason {
	SPAM = 'SPAM',
	ADVERTISING = 'ADVERTISING',
	MEDICAL_MISINFORMATION = 'MEDICAL_MISINFORMATION',
	PERSONAL_DATA = 'PERSONAL_DATA',
	ABUSE = 'ABUSE',
	OTHER = 'OTHER',
}
registerEnumType(ReportReason, { name: 'ReportReason' });

/** PENDING until an admin decides: hidden → RESOLVED, kept → DISMISSED. */
export enum ReportStatus {
	PENDING = 'PENDING',
	RESOLVED = 'RESOLVED',
	DISMISSED = 'DISMISSED',
}
registerEnumType(ReportStatus, { name: 'ReportStatus' });

/** The admin's two buttons on reported content. */
export enum ModerationDecision {
	HIDE = 'HIDE',
	SHOW = 'SHOW',
}
registerEnumType(ModerationDecision, { name: 'ModerationDecision' });
