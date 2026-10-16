import { registerEnumType } from '@nestjs/graphql';

/**
 * The events a member hears about in the bell menu. Only events the platform produces: no
 * queue turn, no like (noise), no "new post by someone you follow" (a write per follower per
 * post). BOOKING_EXPIRED and VISIT_REMINDER come from the booking queue (M9).
 */
export enum NotificationType {
	BOOKING_REQUESTED = 'BOOKING_REQUESTED',
	BOOKING_CONFIRMED = 'BOOKING_CONFIRMED',
	BOOKING_DECLINED = 'BOOKING_DECLINED',
	BOOKING_CANCELLED = 'BOOKING_CANCELLED',
	BOOKING_EXPIRED = 'BOOKING_EXPIRED',
	VISIT_REMINDER = 'VISIT_REMINDER',
	REVIEW_REQUEST = 'REVIEW_REQUEST',
	NEW_MESSAGE = 'NEW_MESSAGE',
	INQUIRY_ANSWERED = 'INQUIRY_ANSWERED',
	NEW_FOLLOWER = 'NEW_FOLLOWER',
	ARTICLE_COMMENT = 'ARTICLE_COMMENT',
	DOCTOR_ANSWERED = 'DOCTOR_ANSWERED',
}
registerEnumType(NotificationType, { name: 'NotificationType' });

export enum NotificationStatus {
	WAIT = 'WAIT',
	READ = 'READ',
}
registerEnumType(NotificationStatus, { name: 'NotificationStatus' });

/** The tabs of the Notifications page. */
export enum NotificationGroup {
	BOOKING = 'BOOKING',
	CHAT = 'CHAT',
	REVIEW = 'REVIEW',
	COMMUNITY = 'COMMUNITY',
	INQUIRY = 'INQUIRY',
	MEMBER = 'MEMBER',
}
registerEnumType(NotificationGroup, { name: 'NotificationGroup' });
