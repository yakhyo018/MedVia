import { Field, InputType, Int, ObjectType } from '@nestjs/graphql';
import type { ObjectId } from 'mongoose';
import { IsDate, IsEnum, IsInt, IsMongoId, IsOptional, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { AuditAction, AuditGroup } from '../../enums/admin.enum';
import { TotalCounter } from '../member/member';

@ObjectType()
export class AuditLog {
	@Field(() => String)
	_id!: ObjectId;

	@Field(() => AuditAction)
	auditAction!: AuditAction;

	@Field(() => AuditGroup)
	auditGroup!: AuditGroup;

	@Field(() => String)
	auditRefId!: ObjectId;

	@Field(() => String, { nullable: true })
	auditNote?: string;

	/** The admin who decided. */
	@Field(() => String)
	memberId!: ObjectId;

	/** The admin's name — on the feed only. */
	@Field(() => String, { nullable: true })
	adminName?: string;

	@Field(() => Date)
	createdAt!: Date;
}

@ObjectType()
export class AuditLogs {
	@Field(() => [AuditLog])
	list!: AuditLog[];

	@Field(() => [TotalCounter], { nullable: true })
	metaCounter!: TotalCounter[];
}

/** The history of one clinic, treatment, review … */
@InputType()
export class AuditLogsInquiry {
	@IsEnum(AuditGroup)
	@Field(() => AuditGroup)
	auditGroup!: AuditGroup;

	@IsMongoId()
	@Field(() => String)
	auditRefId!: string;
}

/** "Recent activity": every decision, narrowed by what, who and when. */
@InputType()
export class AuditFeedInquiry {
	@IsInt()
	@Min(1)
	@Field(() => Int)
	page!: number;

	@IsInt()
	@Min(1)
	@Max(100)
	@Field(() => Int)
	limit!: number;

	@IsOptional()
	@IsEnum(AuditGroup)
	@Field(() => AuditGroup, { nullable: true })
	auditGroup?: AuditGroup;

	@IsOptional()
	@IsEnum(AuditAction)
	@Field(() => AuditAction, { nullable: true })
	auditAction?: AuditAction;

	/** One admin's decisions. */
	@IsOptional()
	@IsMongoId()
	@Field(() => String, { nullable: true })
	memberId?: string;

	@IsOptional()
	@Type(() => Date)
	@IsDate()
	@Field(() => Date, { nullable: true })
	from?: Date;

	@IsOptional()
	@Type(() => Date)
	@IsDate()
	@Field(() => Date, { nullable: true })
	to?: Date;
}
