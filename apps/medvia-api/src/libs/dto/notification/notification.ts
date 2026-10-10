import { Field, InputType, Int, ObjectType } from '@nestjs/graphql';
import type { ObjectId } from 'mongoose';
import {
	ArrayMaxSize,
	IsArray,
	IsBoolean,
	IsEnum,
	IsInt,
	IsMongoId,
	IsOptional,
	Max,
	Min,
} from 'class-validator';
import {
	NotificationGroup,
	NotificationStatus,
	NotificationType,
} from '../../enums/notification.enum';
import { TotalCounter } from '../member/member';

@InputType()
export class NotificationsInquiry {
	@IsInt()
	@Min(1)
	@Field(() => Int)
	page!: number;

	@IsInt()
	@Min(1)
	@Max(50)
	@Field(() => Int)
	limit!: number;

	/** A tab: Bookings, Chat, … */
	@IsOptional()
	@IsEnum(NotificationGroup)
	@Field(() => NotificationGroup, { nullable: true })
	notificationGroup?: NotificationGroup;

	@IsOptional()
	@IsBoolean()
	@Field(() => Boolean, { nullable: true })
	unreadOnly?: boolean;
}

/** Without ids: "Mark all as read". */
@InputType()
export class NotificationsReadInput {
	@IsOptional()
	@IsArray()
	@ArrayMaxSize(100)
	@IsMongoId({ each: true })
	@Field(() => [String], { nullable: true })
	notificationIds?: string[];
}

@ObjectType()
export class Notification {
	@Field(() => String)
	_id!: ObjectId;

	@Field(() => NotificationType)
	notificationType!: NotificationType;

	@Field(() => NotificationStatus)
	notificationStatus!: NotificationStatus;

	@Field(() => NotificationGroup)
	notificationGroup!: NotificationGroup;

	/** English. */
	@Field(() => String)
	notificationTitle!: string;

	@Field(() => String)
	notificationDesc!: string;

	/** The pieces of the text as JSON, to render it in the reader's language from the type. */
	@Field(() => String, { nullable: true })
	notificationParamsJson?: string;

	@Field(() => Int)
	notificationCount!: number;

	@Field(() => String, { nullable: true })
	notificationRefId?: ObjectId;

	@Field(() => String, { nullable: true })
	authorId?: ObjectId;

	@Field(() => String)
	receiverId!: ObjectId;

	@Field(() => Date)
	createdAt!: Date;

	@Field(() => Date)
	updatedAt!: Date;
}

@ObjectType()
export class Notifications {
	@Field(() => [Notification])
	list!: Notification[];

	@Field(() => [TotalCounter], { nullable: true })
	metaCounter!: TotalCounter[];
}
