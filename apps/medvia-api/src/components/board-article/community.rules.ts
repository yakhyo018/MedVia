import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { BoardArticleCategory, BoardArticleStatus } from '../../libs/enums/board-article.enum';
import { Direction, Messages } from '../../libs/enums/common.enum';
import { MemberType } from '../../libs/enums/member.enum';
import { ModerationDecision, ReportStatus } from '../../libs/enums/report.enum';
import { T } from '../../libs/types/common';
import { availableArticleSorts, escapeRegex, toDisplayName } from '../../libs/config';

/** The community rules as pure functions: who writes where, what a list matches, reports. */

/**
 * Who may open a post on which board. Patients ask and talk; health tips come from doctors
 * (and the MedVia team) — a medical tip from an anonymous account is exactly what medical-ad
 * rules worry about. Clinic accounts do not post: that would be advertising.
 */
export const POSTERS: Record<BoardArticleCategory, MemberType[]> = {
	[BoardArticleCategory.QNA]: [MemberType.USER],
	[BoardArticleCategory.HEALTH_TIP]: [MemberType.DOCTOR, MemberType.ADMIN],
	[BoardArticleCategory.FREE]: [MemberType.USER],
};

export function checkCanPost(memberType: MemberType, category: BoardArticleCategory): void {
	if (!POSTERS[category]?.includes(memberType)) {
		throw new ForbiddenException(Messages.CATEGORY_NOT_ALLOWED);
	}
}

/**
 * Photos belong to health tips only: a patient's question or free post with photos invites
 * other people's before/after pictures, which the site cannot check.
 */
export function checkArticleImages(category: BoardArticleCategory, images?: string[]): void {
	if (images?.length && category !== BoardArticleCategory.HEALTH_TIP) {
		throw new BadRequestException(Messages.ARTICLE_IMAGES_NOT_ALLOWED);
	}
}

/** A doctor's comment on a question is the answer that earns the "Doctor answered" badge. */
export const answersQuestion = (category: BoardArticleCategory, commenter: MemberType) =>
	category === BoardArticleCategory.QNA && commenter === MemberType.DOCTOR;

/* ───────────────────────── lists ───────────────────────── */

export interface ArticleSearch {
	articleCategory?: BoardArticleCategory;
	text?: string;
	memberId?: unknown;
	answered?: boolean;
}

/**
 * The public list: ACTIVE posts only. The text is escaped before it becomes a RegExp: built
 * from raw input, "(a+)+$" could freeze the event loop (ReDoS).
 */
export function articleMatch(search: ArticleSearch = {}): T {
	const match: T = { articleStatus: BoardArticleStatus.ACTIVE };
	if (search.articleCategory) match.articleCategory = search.articleCategory;
	if (search.memberId) match.memberId = search.memberId;
	if (search.answered !== undefined) match.articleAnswered = search.answered;
	if (search.text?.trim()) {
		match.articleTitle = { $regex: new RegExp(escapeRegex(search.text.trim()), 'i') };
	}
	return match;
}

/** A whitelisted field (validated by the DTO), newest first by default, _id breaking ties. */
export function articleSort(sort = 'createdAt', direction: Direction = Direction.DESC): T {
	const field = availableArticleSorts.includes(sort) ? sort : 'createdAt';
	return { [field]: direction, _id: direction };
}

/* ───────────────────────── authors ───────────────────────── */

/** "Feride K." for a patient, "Dr. Han Seo-yeon" with the doctor badge, "MedVia" for the team. */
export function authorName(fullName: string, memberType: MemberType): string {
	if (memberType === MemberType.DOCTOR) return `Dr. ${fullName}`;
	if (memberType === MemberType.ADMIN) return 'MedVia';
	return toDisplayName(fullName, true);
}

/* ───────────────────────── reports ───────────────────────── */

/** Five distinct members reporting the same thing hide it until an admin looks. */
export const REPORT_HIDE_THRESHOLD = 5;

export function checkCanReport(reporterId: unknown, authorId: unknown): void {
	if (String(reporterId) === String(authorId)) {
		throw new BadRequestException(Messages.CANNOT_REPORT_OWN);
	}
}

/** Hiding confirms the reports; showing (again) dismisses them. */
export const reportOutcome = (decision: ModerationDecision) =>
	decision === ModerationDecision.HIDE ? ReportStatus.RESOLVED : ReportStatus.DISMISSED;
