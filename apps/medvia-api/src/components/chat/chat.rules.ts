import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Types } from 'mongoose';
import { BookingActor, BookingStatus } from '../../libs/enums/booking.enum';
import { SenderType } from '../../libs/enums/chat.enum';
import { Language, Messages } from '../../libs/enums/common.enum';
import { MemberType } from '../../libs/enums/member.enum';
import { T } from '../../libs/types/common';
import { seoulDateOf } from '../booking/booking.rules';

/**
 * The chat rules as pure functions: who is which side, what each side sees, how the history
 * is paged, and the system lines bookings add. No database, no sockets.
 */

/** The two sides of a room. A doctor or an admin is neither: the chat is patient ↔ clinic. */
export function sideOf(memberType: MemberType): SenderType.PATIENT | SenderType.CLINIC {
	if (memberType === MemberType.USER) return SenderType.PATIENT;
	if (memberType === MemberType.AGENT) return SenderType.CLINIC;
	throw new ForbiddenException(Messages.ONLY_SPECIFIC_ROLES_ALLOWED);
}

/** The rooms a side may open, from the token: the patient's own, or the clinic's own. */
export function roomScope(side: SenderType, ids: { memberId: unknown; clinicId?: unknown }): T {
	return side === SenderType.PATIENT ? { memberId: ids.memberId } : { clinicId: ids.clinicId };
}

/** A message from one side is unread for the other side. */
export const unreadOf = (side: SenderType) =>
	side === SenderType.PATIENT ? 'roomUnreadPatient' : 'roomUnreadClinic';
export const otherUnread = (sender: SenderType) =>
	sender === SenderType.PATIENT ? 'roomUnreadClinic' : 'roomUnreadPatient';

/** The clinic team reads Korean; the patient reads their own language. */
export const viewerLang = (side: SenderType, patientLang: Language): Language =>
	side === SenderType.CLINIC ? Language.KO : patientLang;

/** The language a message must be translated into for the other side to read it. */
export const targetLang = (sender: SenderType, patientLang: Language): Language =>
	sender === SenderType.PATIENT ? Language.KO : patientLang;

/**
 * What a viewer reads: the original if it is already in their language, else its translation,
 * else the original (a translation that failed or is still on its way).
 */
export function textFor(message: T, lang: Language): string {
	if (message.messageLang === lang) return message.messageText;
	const translated = (message.messageTranslations ?? []).find((t: T) => t.lang === lang);
	return translated?.text ?? message.messageText;
}

/* ───────────────────────── cursor paging ───────────────────────── */

/**
 * The history is paged by cursor, not by page number: new messages keep arriving at the top,
 * so "page 2" would shift under the reader and repeat or skip messages. The cursor is the
 * position of the oldest message seen — { createdAt, _id }, _id breaking ties in one millisecond.
 */
export function encodeCursor(message: { createdAt: Date; _id: unknown }): string {
	return Buffer.from(`${message.createdAt.toISOString()}|${String(message._id)}`).toString(
		'base64url',
	);
}

export function decodeCursor(cursor: string): { createdAt: Date; _id: Types.ObjectId } {
	const [iso, id] = Buffer.from(cursor, 'base64url').toString('utf8').split('|');
	const createdAt = new Date(iso);
	if (!id || !Types.ObjectId.isValid(id) || Number.isNaN(createdAt.getTime())) {
		throw new BadRequestException(Messages.BAD_REQUEST);
	}
	return { createdAt, _id: new Types.ObjectId(id) };
}

/** Messages strictly older than the cursor, in the order of the { createdAt, _id } index. */
export function olderThan(cursor: { createdAt: Date; _id: Types.ObjectId }): T {
	return {
		$or: [
			{ createdAt: { $lt: cursor.createdAt } },
			{ createdAt: cursor.createdAt, _id: { $lt: cursor._id } },
		],
	};
}

/* ───────────────────────── system lines ───────────────────────── */

/**
 * A booking line is news for whoever did not cause it: the clinic learns of a request or a
 * patient's cancel, the patient of a confirm or decline; an admin's cancel is news to both.
 */
export function unreadForLine(actor: BookingActor): string[] {
	if (actor === BookingActor.PATIENT) return ['roomUnreadClinic'];
	if (actor === BookingActor.CLINIC) return ['roomUnreadPatient'];
	return ['roomUnreadPatient', 'roomUnreadClinic'];
}

const LINE: Partial<Record<BookingStatus, string>> = {
	[BookingStatus.PENDING]: 'Booking request',
	[BookingStatus.CONFIRMED]: 'Booking confirmed',
	[BookingStatus.DECLINED]: 'Booking declined',
	[BookingStatus.CANCELLED]: 'Booking cancelled',
	[BookingStatus.COMPLETED]: 'Visit completed',
	[BookingStatus.NO_SHOW]: 'Marked as no-show',
};

/** "Booking confirmed · Laser Toning · 2026-09-22 14:00 KST" — null for statuses with no line. */
export function bookingLine(
	status: BookingStatus,
	treatmentName: string,
	bookingDate: Date,
	reason?: string,
): string | null {
	const label = LINE[status];
	if (!label) return null;
	const time = new Date(bookingDate.getTime() + 9 * 60 * 60_000).toISOString().slice(11, 16);
	const line = `${label} · ${treatmentName} · ${seoulDateOf(bookingDate)} ${time} KST`;
	return reason ? `${line} — ${reason}` : line;
}
