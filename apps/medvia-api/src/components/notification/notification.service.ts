import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, ObjectId } from 'mongoose';
import {
	Notification,
	Notifications,
	NotificationsInquiry,
	NotificationsReadInput,
} from '../../libs/dto/notification/notification';
import { MemberStatus } from '../../libs/enums/member.enum';
import { NotificationStatus, NotificationType } from '../../libs/enums/notification.enum';
import { T } from '../../libs/types/common';
import { shapeIntoMongoObjectId } from '../../libs/config';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { allowedBySettings, GROUP_OF, renderNotification } from './notification.rules';

const DUPLICATE_KEY = 11000;

export interface NotifyEvent {
	type: NotificationType;
	receiverId: unknown;
	refId?: unknown;
	authorId?: unknown;
	params?: T;
}

/**
 * The bell menu. Other modules call `notify` after their own work has committed, and it never
 * throws: a notification that cannot be written is logged and the booking, message or comment
 * stands — the same rule as the chat's booking lines. No module imports this one back.
 */
@Injectable()
export class NotificationService {
	private readonly logger = new Logger(NotificationService.name);

	constructor(
		@InjectModel('Notification') private readonly notificationModel: Model<T>,
		@InjectModel('Member') private readonly memberModel: Model<T>,
		private readonly realtime: RealtimeGateway,
	) {}

	/**
	 * Not to oneself, not to a closed account, not against the member's switch. A chat message
	 * refreshes the room's one unread line ("3 new messages") instead of adding a line each.
	 */
	public async notify(event: NotifyEvent): Promise<void> {
		try {
			if (!event.receiverId) return;
			if (event.authorId && String(event.authorId) === String(event.receiverId)) return;

			const receiver = await this.memberModel
				.findById(event.receiverId, { memberNotify: 1, memberStatus: 1 })
				.lean()
				.exec();
			if (!receiver || receiver.memberStatus !== MemberStatus.ACTIVE) return;
			if (!allowedBySettings(event.type, receiver.memberNotify)) return;

			const { title, desc } = renderNotification(event.type, event.params);
			const fields = {
				notificationGroup: GROUP_OF[event.type],
				notificationTitle: title,
				notificationDesc: desc,
				notificationParams: event.params ?? {},
				authorId: event.authorId,
			};

			const saved =
				event.type === NotificationType.NEW_MESSAGE
					? await this.upsertChatLine(event, fields)
					: (
							await this.notificationModel.create({
								...fields,
								notificationType: event.type,
								notificationRefId: event.refId,
								receiverId: event.receiverId,
							})
						).toObject();

			this.realtime.emitToMember(event.receiverId, 'notification:new', this.present(saved));
		} catch (err: any) {
			this.logger.warn(`notification ${event.type} not delivered: ${err.message}`);
		}
	}

	/** The chat opened: its unread line goes READ. Never throws. */
	public async markReadByRef(receiverId: unknown, refId: unknown): Promise<void> {
		try {
			await this.notificationModel
				.updateMany(
					{ receiverId, notificationRefId: refId, notificationStatus: NotificationStatus.WAIT },
					{ $set: { notificationStatus: NotificationStatus.READ } },
				)
				.exec();
		} catch (err: any) {
			this.logger.warn(`notifications of ${String(refId)} not marked read: ${err.message}`);
		}
	}

	/* ───────────────────────── the member's own ───────────────────────── */

	public async getMyNotifications(
		memberId: ObjectId,
		input: NotificationsInquiry,
	): Promise<Notifications> {
		const match: T = { receiverId: memberId };
		if (input.notificationGroup) match.notificationGroup = input.notificationGroup;
		if (input.unreadOnly) match.notificationStatus = NotificationStatus.WAIT;
		const [result] = await this.notificationModel
			.aggregate([
				{ $match: match },
				{ $sort: { updatedAt: -1, _id: -1 } },
				{
					$facet: {
						list: [{ $skip: (input.page - 1) * input.limit }, { $limit: input.limit }],
						metaCounter: [{ $count: 'total' }],
					},
				},
			])
			.exec();
		return { list: result.list.map((n: T) => this.present(n)), metaCounter: result.metaCounter };
	}

	/** The red badge on the bell. */
	public async getUnreadCount(memberId: ObjectId): Promise<number> {
		return await this.notificationModel
			.countDocuments({ receiverId: memberId, notificationStatus: NotificationStatus.WAIT })
			.exec();
	}

	/** Some, or all ("Mark all as read") — always only the member's own. Returns how many changed. */
	public async markRead(memberId: ObjectId, input: NotificationsReadInput): Promise<number> {
		const filter: T = { receiverId: memberId, notificationStatus: NotificationStatus.WAIT };
		if (input.notificationIds?.length) {
			filter._id = { $in: input.notificationIds.map((id) => shapeIntoMongoObjectId(id)) };
		}
		const result = await this.notificationModel
			.updateMany(filter, { $set: { notificationStatus: NotificationStatus.READ } })
			.exec();
		return result.modifiedCount;
	}

	/* ───────────────────────── helpers ───────────────────────── */

	/**
	 * One unread line per room: an upsert on the partial unique index. Two first messages at the
	 * same moment can both try to insert; the index refuses the second, which then updates.
	 */
	private async upsertChatLine(event: NotifyEvent, fields: T): Promise<T> {
		const filter = {
			receiverId: event.receiverId,
			notificationType: NotificationType.NEW_MESSAGE,
			notificationRefId: event.refId,
			notificationStatus: NotificationStatus.WAIT,
		};
		const update = { $set: fields, $inc: { notificationCount: 1 } };
		try {
			return (await this.notificationModel
				.findOneAndUpdate(filter, update, { upsert: true, new: true })
				.lean()
				.exec()) as T;
		} catch (err: any) {
			if (err?.code !== DUPLICATE_KEY) throw err;
			return (await this.notificationModel
				.findOneAndUpdate(filter, update, { new: true })
				.lean()
				.exec()) as T;
		}
	}

	private present(notification: T): Notification {
		const { notificationParams, ...rest } = notification;
		return {
			...rest,
			notificationParamsJson: JSON.stringify(notificationParams ?? {}),
		} as Notification;
	}
}
