import { Types } from 'mongoose';
import { BookingActor, BookingStatus } from '../../libs/enums/booking.enum';
import { MessageType, SenderType, TranslationStatus } from '../../libs/enums/chat.enum';
import { Language } from '../../libs/enums/common.enum';
import { MemberType } from '../../libs/enums/member.enum';
import {
	bookingLine,
	decodeCursor,
	encodeCursor,
	needsRetry,
	olderThan,
	otherUnread,
	planTranslation,
	roomScope,
	senderLang,
	sideOf,
	targetLang,
	textFor,
	translationUpdate,
	unreadForLine,
	unreadOf,
	viewerLang,
} from './chat.rules';

describe('sides', () => {
	it('a patient and a clinic account are the two sides', () => {
		expect(sideOf(MemberType.USER)).toBe(SenderType.PATIENT);
		expect(sideOf(MemberType.AGENT)).toBe(SenderType.CLINIC);
	});

	it.each([MemberType.DOCTOR, MemberType.ADMIN])('a %s is neither', (type) => {
		expect(() => sideOf(type)).toThrow('Allowed only for members with specific roles!');
	});

	it('scopes rooms from the token', () => {
		const ids = { memberId: 'm', clinicId: 'c' };
		expect(roomScope(SenderType.PATIENT, ids)).toEqual({ memberId: 'm' });
		expect(roomScope(SenderType.CLINIC, ids)).toEqual({ clinicId: 'c' });
	});

	it("a message is unread for the other side, read resets one's own", () => {
		expect(otherUnread(SenderType.PATIENT)).toBe('roomUnreadClinic');
		expect(otherUnread(SenderType.CLINIC)).toBe('roomUnreadPatient');
		expect(unreadOf(SenderType.PATIENT)).toBe('roomUnreadPatient');
	});
});

describe('languages', () => {
	it('the clinic reads Korean, the patient their own language', () => {
		expect(viewerLang(SenderType.CLINIC, Language.RU)).toBe(Language.KO);
		expect(viewerLang(SenderType.PATIENT, Language.RU)).toBe(Language.RU);
	});

	it("a message is translated into the other side's language", () => {
		expect(targetLang(SenderType.PATIENT, Language.UZ)).toBe(Language.KO);
		expect(targetLang(SenderType.CLINIC, Language.UZ)).toBe(Language.UZ);
	});

	it('the patient writes in the language picked in the message box, else the profile one', () => {
		expect(senderLang(SenderType.PATIENT, Language.RU)).toBe(Language.RU);
		expect(senderLang(SenderType.PATIENT, Language.RU, Language.UZ)).toBe(Language.UZ);
		expect(senderLang(SenderType.CLINIC, Language.RU, Language.UZ)).toBe(Language.KO);
	});

	it('a patient writing in Korean needs no translation', () => {
		const lang = senderLang(SenderType.PATIENT, Language.RU, Language.KO);
		expect(
			planTranslation(MessageType.TEXT, lang, targetLang(SenderType.PATIENT, Language.RU), true),
		).toBe(TranslationStatus.SKIPPED);
	});

	const message = {
		messageText: 'Здравствуйте!',
		messageLang: Language.RU,
		messageTranslations: [{ lang: Language.KO, text: '안녕하세요!' }],
	};

	it('shows the original to the writer and the translation to the reader', () => {
		expect(textFor(message, Language.RU)).toBe('Здравствуйте!');
		expect(textFor(message, Language.KO)).toBe('안녕하세요!');
	});

	it('falls back to the original while there is no translation', () => {
		expect(textFor({ ...message, messageTranslations: [] }, Language.KO)).toBe('Здравствуйте!');
	});
});

describe('cursor', () => {
	const createdAt = new Date('2026-10-08T05:00:00.123Z');
	const _id = new Types.ObjectId();

	it('round-trips the position of a message', () => {
		expect(decodeCursor(encodeCursor({ createdAt, _id }))).toEqual({ createdAt, _id });
	});

	it.each(['', 'not-a-cursor', Buffer.from('2026|abc').toString('base64url')])(
		'refuses %p',
		(cursor) => {
			expect(() => decodeCursor(cursor)).toThrow();
		},
	);

	it('takes older messages, and in the same millisecond the smaller id', () => {
		expect(olderThan({ createdAt, _id })).toEqual({
			$or: [{ createdAt: { $lt: createdAt } }, { createdAt, _id: { $lt: _id } }],
		});
	});
});

describe('bookingLine', () => {
	// 05:00 UTC is 14:00 in Seoul.
	const date = new Date('2026-09-22T05:00:00Z');

	it('writes the status, the treatment and the Seoul time', () => {
		expect(bookingLine(BookingStatus.CONFIRMED, 'Laser Toning', date)).toBe(
			'Booking confirmed · Laser Toning · 2026-09-22 14:00 KST',
		);
	});

	it('adds the reason of a decline', () => {
		expect(bookingLine(BookingStatus.DECLINED, 'Laser Toning', date, 'Doctor away')).toBe(
			'Booking declined · Laser Toning · 2026-09-22 14:00 KST — Doctor away',
		);
	});

	it('has no line for an expiry nobody wrote', () => {
		expect(bookingLine(BookingStatus.EXPIRED, 'Laser Toning', date)).toBeNull();
	});

	it('is unread for whoever did not cause it', () => {
		expect(unreadForLine(BookingActor.PATIENT)).toEqual(['roomUnreadClinic']);
		expect(unreadForLine(BookingActor.CLINIC)).toEqual(['roomUnreadPatient']);
		expect(unreadForLine(BookingActor.ADMIN)).toEqual(['roomUnreadPatient', 'roomUnreadClinic']);
	});
});

describe('translation (AI-1)', () => {
	const NOW = new Date('2026-10-09T05:00:00Z');

	it("translates a person's text with consent into another language", () => {
		expect(planTranslation(MessageType.TEXT, Language.RU, Language.KO, true)).toBe(
			TranslationStatus.PENDING,
		);
	});

	it.each([
		['no consent', MessageType.TEXT, Language.RU, false],
		["already in the reader's language", MessageType.TEXT, Language.KO, true],
		['a system line', MessageType.SYSTEM, Language.EN, true],
	])('skips %s', (_name, type, lang, consented) => {
		expect(planTranslation(type, lang, Language.KO, consented)).toBe(TranslationStatus.SKIPPED);
	});

	it('stores the translation and the detected language', () => {
		expect(translationUpdate({ sourceLang: Language.UZ, text: '감사합니다' }, Language.KO)).toEqual(
			{
				messageTranslationStatus: TranslationStatus.DONE,
				messageLang: Language.UZ,
				messageTranslations: [{ lang: Language.KO, text: '감사합니다' }],
			},
		);
	});

	it('needs no translation when the patient already wrote Korean', () => {
		expect(
			translationUpdate({ sourceLang: Language.KO, text: '안녕하세요' }, Language.KO),
		).toMatchObject({
			messageTranslationStatus: TranslationStatus.SKIPPED,
			messageTranslations: [],
		});
	});

	it('marks FAILED when the provider gave nothing', () => {
		expect(translationUpdate(null, Language.KO)).toEqual({
			messageTranslationStatus: TranslationStatus.FAILED,
		});
	});

	it('retries FAILED and PENDING stuck for more than 2 minutes, nothing else', () => {
		const msg = (status: TranslationStatus, minutesAgo: number, type = MessageType.TEXT) => ({
			messageType: type,
			messageTranslationStatus: status,
			updatedAt: new Date(NOW.getTime() - minutesAgo * 60_000),
		});
		expect(needsRetry(msg(TranslationStatus.FAILED, 0), NOW)).toBe(true);
		expect(needsRetry(msg(TranslationStatus.PENDING, 3), NOW)).toBe(true);
		expect(needsRetry(msg(TranslationStatus.PENDING, 1), NOW)).toBe(false);
		expect(needsRetry(msg(TranslationStatus.DONE, 60), NOW)).toBe(false);
		expect(needsRetry(msg(TranslationStatus.FAILED, 0, MessageType.SYSTEM), NOW)).toBe(false);
	});
});
