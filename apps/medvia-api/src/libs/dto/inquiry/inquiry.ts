import { Field, InputType, Int, ObjectType } from '@nestjs/graphql';
import type { ObjectId } from 'mongoose';
import { IsBoolean, IsEnum, IsInt, IsMongoId, IsOptional, Length, Max, Min } from 'class-validator';
import { Language } from '../../enums/common.enum';
import { InquiryCategory, InquirySender, InquiryStatus } from '../../enums/inquiry.enum';
import { TotalCounter } from '../member/member';

/** "Send an inquiry". */
@InputType()
export class InquiryInput {
	@IsEnum(InquiryCategory)
	@Field(() => InquiryCategory)
	inquiryCategory!: InquiryCategory;

	@Length(2, 150)
	@Field(() => String)
	inquiryTitle!: string;

	@Length(5, 3000)
	@Field(() => String)
	inquiryContent!: string;

	@IsEnum(Language)
	@Field(() => Language)
	inquiryLang!: Language;

	/** Defaults to inquiryLang. */
	@IsOptional()
	@IsEnum(Language)
	@Field(() => Language, { nullable: true })
	inquiryReplyLang?: Language;

	/** "Related booking (optional)" — must be one of the patient's own. */
	@IsOptional()
	@IsMongoId()
	@Field(() => String, { nullable: true })
	bookingId?: string;
}

/** A message in the thread, from the patient or the team. */
@InputType()
export class InquiryMessageInput {
	@IsMongoId()
	@Field(() => String)
	inquiryId!: string;

	@Length(1, 3000)
	@Field(() => String)
	text!: string;

	@IsEnum(Language)
	@Field(() => Language)
	lang!: Language;
}

@InputType()
export class AdminInquiriesInquiry {
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
	@IsEnum(InquiryStatus)
	@Field(() => InquiryStatus, { nullable: true })
	inquiryStatus?: InquiryStatus;

	@IsOptional()
	@IsEnum(InquiryCategory)
	@Field(() => InquiryCategory, { nullable: true })
	inquiryCategory?: InquiryCategory;

	/** "Open": NEW and IN_PROGRESS — waiting for the team. */
	@IsOptional()
	@IsBoolean()
	@Field(() => Boolean, { nullable: true })
	open?: boolean;
}

@ObjectType()
export class InquiryMessage {
	@Field(() => String)
	senderId!: ObjectId;

	@Field(() => InquirySender)
	senderType!: InquirySender;

	@Field(() => String)
	text!: string;

	@Field(() => Language)
	lang!: Language;

	@Field(() => Date)
	createdAt!: Date;
}

@ObjectType()
export class Inquiry {
	@Field(() => String)
	_id!: ObjectId;

	@Field(() => InquiryCategory)
	inquiryCategory!: InquiryCategory;

	@Field(() => InquiryStatus)
	inquiryStatus!: InquiryStatus;

	@Field(() => String)
	inquiryTitle!: string;

	@Field(() => String)
	inquiryContent!: string;

	@Field(() => Language)
	inquiryLang!: Language;

	@Field(() => Language)
	inquiryReplyLang!: Language;

	@Field(() => [InquiryMessage])
	inquiryMessages!: InquiryMessage[];

	@Field(() => Date, { nullable: true })
	resolvedAt?: Date;

	@Field(() => String)
	memberId!: ObjectId;

	@Field(() => String, { nullable: true })
	bookingId?: ObjectId;

	@Field(() => Date)
	createdAt!: Date;

	@Field(() => Date)
	updatedAt!: Date;

	/** For the team: "Feride Karimova · writes in Русский". */
	@Field(() => String, { nullable: true })
	patientName?: string;

	@Field(() => String, { nullable: true })
	bookingCode?: string;
}

@ObjectType()
export class Inquiries {
	@Field(() => [Inquiry])
	list!: Inquiry[];

	@Field(() => [TotalCounter], { nullable: true })
	metaCounter!: TotalCounter[];
}
