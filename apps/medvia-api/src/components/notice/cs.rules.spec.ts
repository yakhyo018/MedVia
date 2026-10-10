import { Language, Messages } from '../../libs/enums/common.enum';
import { InquiryCategory, InquirySender, InquiryStatus } from '../../libs/enums/inquiry.enum';
import { NoticeCategory, NoticeStatus } from '../../libs/enums/notice.enum';
import {
	checkCanResolve,
	checkNoticeShape,
	INQUIRY_MOVES,
	localizeNotice,
	MAX_THREAD,
	nextStatusOnMessage,
	publishedAtFor,
	threadHasRoom,
} from './cs.rules';

const NOW = new Date('2026-10-10T05:00:00Z');

describe('notices', () => {
	const notice = {
		noticeTitle: 'Chuseok holiday',
		noticeContent: 'Partner clinic hours',
		noticeTranslations: [{ lang: Language.RU, title: 'Чхусок', content: 'Часы работы клиник' }],
	};

	it('gives the reader their language when the team translated it', () => {
		expect(localizeNotice(notice, Language.RU)).toMatchObject({
			displayTitle: 'Чхусок',
			displayContent: 'Часы работы клиник',
			displayLang: Language.RU,
		});
	});

	it('falls back to English, title and content together', () => {
		expect(localizeNotice(notice, Language.KK)).toMatchObject({
			displayTitle: 'Chuseok holiday',
			displayContent: 'Partner clinic hours',
			displayLang: Language.EN,
		});
		expect(localizeNotice(notice)).toMatchObject({ displayLang: Language.EN });
	});

	it('needs a tab for an FAQ and none for a notice', () => {
		expect(() => checkNoticeShape(NoticeCategory.FAQ, InquiryCategory.BOOKING)).not.toThrow();
		expect(() => checkNoticeShape(NoticeCategory.NOTICE)).not.toThrow();
		expect(() => checkNoticeShape(NoticeCategory.FAQ)).toThrow(Messages.NOTICE_FAQ_CATEGORY);
		expect(() => checkNoticeShape(NoticeCategory.NOTICE, InquiryCategory.BOOKING)).toThrow(
			Messages.NOTICE_FAQ_CATEGORY,
		);
	});

	it('dates the first publication only', () => {
		expect(publishedAtFor(null, NoticeStatus.ACTIVE, NOW)).toEqual(NOW);
		expect(
			publishedAtFor({ publishedAt: new Date('2026-09-15') }, NoticeStatus.ACTIVE, NOW),
		).toBeUndefined();
		expect(publishedAtFor(null, NoticeStatus.HOLD, NOW)).toBeUndefined();
	});
});

describe('inquiries', () => {
	it("the team's message answers, from any open status", () => {
		for (const s of [InquiryStatus.NEW, InquiryStatus.IN_PROGRESS, InquiryStatus.ANSWERED])
			expect(nextStatusOnMessage(s, InquirySender.ADMIN)).toBe(InquiryStatus.ANSWERED);
	});

	it("a follow-up after an answer goes back to the team's queue", () => {
		expect(nextStatusOnMessage(InquiryStatus.ANSWERED, InquirySender.PATIENT)).toBe(
			InquiryStatus.IN_PROGRESS,
		);
		expect(nextStatusOnMessage(InquiryStatus.NEW, InquirySender.PATIENT)).toBe(InquiryStatus.NEW);
	});

	it('a resolved inquiry is closed for everyone', () => {
		expect(INQUIRY_MOVES[InquiryStatus.RESOLVED]).toBeUndefined();
		for (const sender of Object.values(InquirySender))
			expect(() => nextStatusOnMessage(InquiryStatus.RESOLVED, sender)).toThrow(
				Messages.INQUIRY_CLOSED,
			);
		expect(() => checkCanResolve(InquiryStatus.RESOLVED)).toThrow(Messages.INQUIRY_CLOSED);
		expect(() => checkCanResolve(InquiryStatus.ANSWERED)).not.toThrow();
	});

	it('caps the thread with a filter on the last slot', () => {
		expect(threadHasRoom()).toEqual({ [`inquiryMessages.${MAX_THREAD - 1}`]: { $exists: false } });
		expect(MAX_THREAD).toBe(50);
	});
});
