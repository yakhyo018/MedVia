import { BadRequestException } from '@nestjs/common';
import { AuditAction } from '../../libs/enums/admin.enum';
import { Language, Messages } from '../../libs/enums/common.enum';
import { InquiryCategory, InquirySender, InquiryStatus } from '../../libs/enums/inquiry.enum';
import { NoticeCategory, NoticeStatus } from '../../libs/enums/notice.enum';
import { T } from '../../libs/types/common';

/** The CS rules as pure functions: notices in the reader's language, the inquiry life cycle. */

/* ───────────────────────── notices ───────────────────────── */

/** An FAQ lives under a tab (Booking, Payment…); a notice does not. */
export function checkNoticeShape(category: NoticeCategory, faqCategory?: InquiryCategory): void {
	const isFaq = category === NoticeCategory.FAQ;
	if (isFaq !== !!faqCategory) throw new BadRequestException(Messages.NOTICE_FAQ_CATEGORY);
}

/**
 * The reader's language if the team translated it, English otherwise — never a half: title and
 * content come from the same translation.
 */
export function localizeNotice(notice: T, lang?: Language): T {
	const translation = lang && (notice.noticeTranslations ?? []).find((t: T) => t.lang === lang);
	return {
		...notice,
		displayTitle: translation?.title ?? notice.noticeTitle,
		displayContent: translation?.content ?? notice.noticeContent,
		displayLang: translation?.lang ?? Language.EN,
	};
}

/** The date on the list is the first publication, not the last edit. */
export function publishedAtFor(current: T | null, nextStatus: NoticeStatus | undefined, now: Date) {
	if (nextStatus !== NoticeStatus.ACTIVE || current?.publishedAt) return undefined;
	return now;
}

/**
 * The audit line for a status change by the team: going live, coming down, or removed. Edits
 * of the words are not decisions; saving a draft as a draft is nothing.
 */
export function noticeAuditAction(from: NoticeStatus | null, to: NoticeStatus): AuditAction | null {
	if (from === to) return null;
	if (to === NoticeStatus.ACTIVE) return AuditAction.NOTICE_PUBLISH;
	if (to === NoticeStatus.DELETE) return AuditAction.NOTICE_REMOVE;
	return from === NoticeStatus.ACTIVE ? AuditAction.NOTICE_UNPUBLISH : null;
}

/* ───────────────────────── inquiries ───────────────────────── */

export const MAX_THREAD = 50;

/** "Room for one more message" as a filter: the 50th slot of the array is still empty. */
export const threadHasRoom = (): T => ({
	[`inquiryMessages.${MAX_THREAD - 1}`]: { $exists: false },
});

/** Waiting for the team: the top of its queue. */
export const OPEN_STATUSES = [InquiryStatus.NEW, InquiryStatus.IN_PROGRESS];

/**
 * status → sender → next status. The team's message answers; the patient's follow-up after an
 * answer puts the ticket back in the team's queue. RESOLVED is final and absent here.
 */
export const INQUIRY_MOVES: Partial<Record<InquiryStatus, Record<InquirySender, InquiryStatus>>> = {
	[InquiryStatus.NEW]: { PATIENT: InquiryStatus.NEW, ADMIN: InquiryStatus.ANSWERED },
	[InquiryStatus.IN_PROGRESS]: {
		PATIENT: InquiryStatus.IN_PROGRESS,
		ADMIN: InquiryStatus.ANSWERED,
	},
	[InquiryStatus.ANSWERED]: { PATIENT: InquiryStatus.IN_PROGRESS, ADMIN: InquiryStatus.ANSWERED },
};

export function nextStatusOnMessage(current: InquiryStatus, sender: InquirySender): InquiryStatus {
	const next = INQUIRY_MOVES[current]?.[sender];
	if (!next) throw new BadRequestException(Messages.INQUIRY_CLOSED);
	return next;
}

export function checkCanResolve(current: InquiryStatus): void {
	if (current === InquiryStatus.RESOLVED) throw new BadRequestException(Messages.INQUIRY_CLOSED);
}
