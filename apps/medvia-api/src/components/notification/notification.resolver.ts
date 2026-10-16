import { UseGuards } from '@nestjs/common';
import { Args, Int, Mutation, Query, Resolver } from '@nestjs/graphql';
import type { ObjectId } from 'mongoose';
import { NotificationService } from './notification.service';
import {
	Notifications,
	NotificationsInquiry,
	NotificationsReadInput,
} from '../../libs/dto/notification/notification';
import { AuthMember } from '../auth/decorators/authMember.decorator';
import { AuthGuard } from '../auth/guards/auth.guard';

/** Every signed-in member has a bell; each sees only their own notifications. */
@Resolver()
export class NotificationResolver {
	constructor(private readonly notificationService: NotificationService) {}

	@UseGuards(AuthGuard)
	@Query(() => Notifications)
	public async getMyNotifications(
		@Args('input') input: NotificationsInquiry,
		@AuthMember('_id') memberId: ObjectId,
	): Promise<Notifications> {
		console.log('Query: getMyNotifications');
		return await this.notificationService.getMyNotifications(memberId, input);
	}

	@UseGuards(AuthGuard)
	@Query(() => Int)
	public async getUnreadNotificationCount(@AuthMember('_id') memberId: ObjectId): Promise<number> {
		console.log('Query: getUnreadNotificationCount');
		return await this.notificationService.getUnreadCount(memberId);
	}

	@UseGuards(AuthGuard)
	@Mutation(() => Int)
	public async markNotificationsRead(
		@Args('input') input: NotificationsReadInput,
		@AuthMember('_id') memberId: ObjectId,
	): Promise<number> {
		console.log('Mutation: markNotificationsRead');
		return await this.notificationService.markRead(memberId, input);
	}
}
