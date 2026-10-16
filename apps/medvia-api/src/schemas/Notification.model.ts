import { Schema } from 'mongoose';
import {
	NotificationGroup,
	NotificationStatus,
	NotificationType,
} from '../libs/enums/notification.enum';
import { NOTIFICATION_TTL_SECONDS } from '../libs/config';

/**
 * One line of the bell menu. The text is English; `notificationParams` carries the pieces
 * (clinic name, time, preview) so a frontend can render the line in the reader's language from
 * the type. Kept 90 days, then MongoDB's TTL monitor removes it — notifications are not history.
 */
const NotificationSchema = new Schema(
	{
		notificationType: {
			type: String,
			enum: NotificationType,
			required: true,
		},

		notificationStatus: {
			type: String,
			enum: NotificationStatus,
			default: NotificationStatus.WAIT,
		},

		notificationGroup: {
			type: String,
			enum: NotificationGroup,
			required: true,
		},

		notificationTitle: {
			type: String,
			required: true,
		},

		notificationDesc: {
			type: String,
			default: '',
		},

		notificationParams: {
			type: Schema.Types.Mixed,
			default: {},
		},

		// NEW_MESSAGE: how many messages this one line stands for ("3 new messages").
		notificationCount: {
			type: Number,
			default: 1,
		},

		// What it links to: a booking, a chat room, an inquiry, a post, a member.
		notificationRefId: {
			type: Schema.Types.ObjectId,
		},

		authorId: {
			type: Schema.Types.ObjectId,
			ref: 'Member',
		},

		receiverId: {
			type: Schema.Types.ObjectId,
			required: true,
			ref: 'Member',
		},
	},
	{ timestamps: true, collection: 'notifications' },
);

// The bell menu: latest activity first. updatedAt, because a chat line is refreshed in place.
NotificationSchema.index({ receiverId: 1, updatedAt: -1 });

// The red badge: unread count.
NotificationSchema.index({ receiverId: 1, notificationStatus: 1 });

// One unread chat line per room and receiver: the upsert target, and the guard against two
// first messages creating two lines at once.
NotificationSchema.index(
	{ receiverId: 1, notificationRefId: 1 },
	{
		unique: true,
		partialFilterExpression: { notificationType: 'NEW_MESSAGE', notificationStatus: 'WAIT' },
	},
);

// TTL: MongoDB deletes a notification 90 days after its last activity.
NotificationSchema.index({ updatedAt: 1 }, { expireAfterSeconds: NOTIFICATION_TTL_SECONDS });

export default NotificationSchema;
