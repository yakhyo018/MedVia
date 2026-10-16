import { Field, InputType, Int, ObjectType } from '@nestjs/graphql';
import type { ObjectId } from 'mongoose';
import { IsEnum, IsInt, IsMongoId, IsOptional, Length, Max, Min } from 'class-validator';
import {
	ModerationDecision,
	ReportGroup,
	ReportReason,
	ReportStatus,
} from '../../enums/report.enum';
import { TotalCounter } from '../member/member';

@InputType()
export class ReportInput {
	@IsEnum(ReportGroup)
	@Field(() => ReportGroup)
	reportGroup!: ReportGroup;

	@IsMongoId()
	@Field(() => String)
	reportRefId!: string;

	@IsEnum(ReportReason)
	@Field(() => ReportReason)
	reportReason!: ReportReason;

	@IsOptional()
	@Length(1, 500)
	@Field(() => String, { nullable: true })
	reportDetail?: string;
}

/** PENDING (the default) is the moderation queue, oldest first. */
@InputType()
export class ReportsInquiry {
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
	@IsEnum(ReportStatus)
	@Field(() => ReportStatus, { nullable: true })
	reportStatus?: ReportStatus;
}

/** Hide or show a post or a comment; every pending report of it is closed with the decision. */
@InputType()
export class ModerationInput {
	@IsEnum(ReportGroup)
	@Field(() => ReportGroup)
	reportGroup!: ReportGroup;

	@IsMongoId()
	@Field(() => String)
	refId!: string;

	@IsEnum(ModerationDecision)
	@Field(() => ModerationDecision)
	decision!: ModerationDecision;

	/** Kept in the audit log. */
	@IsOptional()
	@Length(1, 500)
	@Field(() => String, { nullable: true })
	note?: string;
}

@ObjectType()
export class Report {
	@Field(() => String)
	_id!: ObjectId;

	@Field(() => ReportGroup)
	reportGroup!: ReportGroup;

	@Field(() => ReportReason)
	reportReason!: ReportReason;

	@Field(() => String, { nullable: true })
	reportDetail?: string;

	@Field(() => ReportStatus)
	reportStatus!: ReportStatus;

	@Field(() => String)
	reportRefId!: ObjectId;

	@Field(() => String)
	memberId!: ObjectId;

	@Field(() => Date)
	createdAt!: Date;

	/** What was reported, for the admin's queue: the post title or the comment text. */
	@Field(() => String, { nullable: true })
	targetText?: string;

	@Field(() => String, { nullable: true })
	targetStatus?: string;
}

@ObjectType()
export class Reports {
	@Field(() => [Report])
	list!: Report[];

	@Field(() => [TotalCounter], { nullable: true })
	metaCounter!: TotalCounter[];
}

/** The result of a moderation: the target's new status and how many reports it closed. */
@ObjectType()
export class ModerationResult {
	@Field(() => String)
	refId!: ObjectId;

	@Field(() => String)
	status!: string;

	@Field(() => Int)
	reportsClosed!: number;
}
