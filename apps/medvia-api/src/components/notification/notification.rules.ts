import { NotificationGroup, NotificationType } from '../../libs/enums/notification.enum';
import { T } from '../../libs/types/common';
import { seoulDateOf } from '../booking/booking.rules';

/**
 * The notification rules as pure functions: the tab of each type, the member's switches, and
 * the English text built from the params (a frontend can build its own from type + params).
 */

const { BOOKING, CHAT, REVIEW, COMMUNITY, INQUIRY, MEMBER } = NotificationGroup;

export const GROUP_OF: Record<NotificationType, NotificationGroup> = {
	[NotificationType.BOOKING_REQUESTED]: BOOKING,
	[NotificationType.BOOKING_CONFIRMED]: BOOKING,
	[NotificationType.BOOKING_DECLINED]: BOOKING,
	[NotificationType.BOOKING_CANCELLED]: BOOKING,
	[NotificationType.REVIEW_REQUEST]: REVIEW,
	[NotificationType.NEW_MESSAGE]: CHAT,
	[NotificationType.INQUIRY_ANSWERED]: INQUIRY,
	[NotificationType.NEW_FOLLOWER]: MEMBER,
	[NotificationType.ARTICLE_COMMENT]: COMMUNITY,
	[NotificationType.DOCTOR_ANSWERED]: COMMUNITY,
};

/**
 * Which of the member's switches (memberNotify) silences a type. A type without a switch is
 * always delivered — an answer from support, for one, is never optional.
 */
export const SETTING_OF: Partial<Record<NotificationType, 'bookingUpdates' | 'chatMessages'>> = {
	[NotificationType.BOOKING_REQUESTED]: 'bookingUpdates',
	[NotificationType.BOOKING_CONFIRMED]: 'bookingUpdates',
	[NotificationType.BOOKING_DECLINED]: 'bookingUpdates',
	[NotificationType.BOOKING_CANCELLED]: 'bookingUpdates',
	[NotificationType.REVIEW_REQUEST]: 'bookingUpdates',
	[NotificationType.NEW_MESSAGE]: 'chatMessages',
};

/** Off only when the member turned the switch off; a missing setting means on (the default). */
export function allowedBySettings(type: NotificationType, memberNotify?: T): boolean {
	const setting = SETTING_OF[type];
	return !setting || memberNotify?.[setting] !== false;
}

/** "2026-09-22 14:00 KST". */
export function seoulWhen(date: Date | string | undefined): string {
	if (!date) return '';
	const d = new Date(date);
	const time = new Date(d.getTime() + 9 * 60 * 60_000).toISOString().slice(11, 16);
	return `${seoulDateOf(d)} ${time} KST`;
}

const clip = (text: string, max = 80) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

/** The English line. Missing params render as empty — a notification never fails on its text. */
export function renderNotification(
	type: NotificationType,
	p: T = {},
): { title: string; desc: string } {
	const s = (key: string) => (p[key] == null ? '' : String(p[key]));
	switch (type) {
		case NotificationType.BOOKING_REQUESTED:
			return {
				title: 'New booking request',
				desc: `${s('patientName')} · ${s('treatmentName')} · ${s('when')}`,
			};
		case NotificationType.BOOKING_CONFIRMED:
			return {
				title: 'Booking confirmed',
				desc: `${s('clinicName')} confirmed ${s('treatmentName')} on ${s('when')}.`,
			};
		case NotificationType.BOOKING_DECLINED:
			return {
				title: 'Booking declined',
				desc: `${s('clinicName')} couldn't take ${s('when')}. The time was released.`,
			};
		case NotificationType.BOOKING_CANCELLED:
			return {
				title: 'Booking cancelled',
				desc: `${s('treatmentName')} on ${s('when')} was cancelled.`,
			};
		case NotificationType.REVIEW_REQUEST:
			return {
				title: 'How was your visit?',
				desc: `Write a verified review for ${s('clinicName')}.`,
			};
		case NotificationType.NEW_MESSAGE:
			return { title: `New message from ${s('senderName')}`, desc: clip(s('preview')) };
		case NotificationType.INQUIRY_ANSWERED:
			return { title: 'Your inquiry was answered', desc: clip(s('inquiryTitle')) };
		case NotificationType.NEW_FOLLOWER:
			return { title: 'New follower', desc: `${s('followerName')} started following you.` };
		case NotificationType.ARTICLE_COMMENT:
			return {
				title: 'New comment on your post',
				desc: `${s('commenterName')} · ${clip(s('articleTitle'), 60)}`,
			};
		case NotificationType.DOCTOR_ANSWERED:
			return {
				title: 'A doctor answered your question',
				desc: `${s('doctorName')} · ${clip(s('articleTitle'), 60)}`,
			};
	}
}
