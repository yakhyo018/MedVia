import { Field, InputType, Int, ObjectType } from '@nestjs/graphql';
import type { ObjectId } from 'mongoose';
import { IsInt, IsMongoId, IsOptional, Max, Min } from 'class-validator';
import { AccessType } from '../../enums/access-log.enum';
import { MemberType } from '../../enums/member.enum';
import { TotalCounter } from '../member/member';

@ObjectType()
export class AccessLog {
	@Field(() => String)
	_id!: ObjectId;

	@Field(() => AccessType)
	accessType!: AccessType;

	@Field(() => String)
	bookingId!: ObjectId;

	@Field(() => String, { nullable: true })
	bookingCode?: string;

	@Field(() => String)
	patientId!: ObjectId;

	@Field(() => String)
	readerId!: ObjectId;

	@Field(() => MemberType)
	readerType!: MemberType;

	@Field(() => String, { nullable: true })
	readerName?: string;

	@Field(() => Date)
	createdAt!: Date;
}

@ObjectType()
export class AccessLogs {
	@Field(() => [AccessLog])
	list!: AccessLog[];

	@Field(() => [TotalCounter], { nullable: true })
	metaCounter!: TotalCounter[];
}

/** The admin's view: one patient, one booking, or everything. */
@InputType()
export class AccessLogsInquiry {
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
	@IsMongoId()
	@Field(() => String, { nullable: true })
	patientId?: string;

	@IsOptional()
	@IsMongoId()
	@Field(() => String, { nullable: true })
	bookingId?: string;
}
