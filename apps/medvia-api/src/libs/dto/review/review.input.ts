import { Field, InputType, Int } from '@nestjs/graphql';
import {
	ArrayMaxSize,
	ArrayUnique,
	Equals,
	IsArray,
	IsBoolean,
	IsEnum,
	IsInt,
	IsMongoId,
	IsOptional,
	Length,
	Max,
	Min,
} from 'class-validator';
import { ReviewFlag, ReviewStatus, ReviewTag } from '../../enums/review.enum';
import { Language } from '../../enums/common.enum';
import { ReviewDecision } from '../../enums/admin.enum';

/** "Write a verified review" — for one COMPLETED booking of the patient. */
@InputType()
export class ReviewCreateInput {
	@IsMongoId()
	@Field(() => String)
	bookingId!: string;

	@IsInt()
	@Min(1)
	@Max(5)
	@Field(() => Int)
	reviewRating!: number;

	@IsOptional()
	@IsArray()
	@ArrayMaxSize(4)
	@ArrayUnique()
	@IsEnum(ReviewTag, { each: true })
	@Field(() => [ReviewTag], { nullable: true })
	reviewTags?: ReviewTag[];

	@Length(10, 2000)
	@Field(() => String)
	reviewContent!: string;

	@IsEnum(Language)
	@Field(() => Language)
	reviewLang!: Language;

	/** "I confirm this review is about my own visit." */
	@Equals(true, { message: 'ownVisitConfirmed must be true' })
	@Field(() => Boolean)
	ownVisitConfirmed!: boolean;
}

/** Any edit sends the review back to the admin (PENDING); a published one leaves the page until then. */
@InputType()
export class ReviewUpdate {
	@IsMongoId()
	@Field(() => String)
	reviewId!: string;

	@IsOptional()
	@IsInt()
	@Min(1)
	@Max(5)
	@Field(() => Int, { nullable: true })
	reviewRating?: number;

	@IsOptional()
	@IsArray()
	@ArrayMaxSize(4)
	@ArrayUnique()
	@IsEnum(ReviewTag, { each: true })
	@Field(() => [ReviewTag], { nullable: true })
	reviewTags?: ReviewTag[];

	@IsOptional()
	@Length(10, 2000)
	@Field(() => String, { nullable: true })
	reviewContent?: string;

	@IsOptional()
	@IsEnum(Language)
	@Field(() => Language, { nullable: true })
	reviewLang?: Language;
}

/** The clinic's or the doctor's public reply. Writing again replaces it. */
@InputType()
export class ReviewReplyInput {
	@IsMongoId()
	@Field(() => String)
	reviewId!: string;

	@Length(2, 1000)
	@Field(() => String)
	replyContent!: string;

	@IsEnum(Language)
	@Field(() => Language)
	replyLang!: Language;
}

/** Published reviews of a clinic, a doctor or a treatment. Public. */
@InputType()
export class ReviewsInquiry {
	@IsInt()
	@Min(1)
	@Field(() => Int)
	page!: number;

	@IsInt()
	@Min(1)
	@Max(50)
	@Field(() => Int)
	limit!: number;

	@IsOptional()
	@IsMongoId()
	@Field(() => String, { nullable: true })
	clinicId?: string;

	@IsOptional()
	@IsMongoId()
	@Field(() => String, { nullable: true })
	doctorId?: string;

	@IsOptional()
	@IsMongoId()
	@Field(() => String, { nullable: true })
	treatmentId?: string;

	/** The dashboards' "Needs reply" tab. The summary still covers every published review. */
	@IsOptional()
	@IsBoolean()
	@Field(() => Boolean, { nullable: true })
	needsReply?: boolean;
}

@InputType()
export class AdminReviewsInquiry {
	@IsInt()
	@Min(1)
	@Field(() => Int)
	page!: number;

	@IsInt()
	@Min(1)
	@Max(100)
	@Field(() => Int)
	limit!: number;

	/** PENDING (the default) is the moderation queue: oldest submission first. */
	@IsOptional()
	@IsEnum(ReviewStatus)
	@Field(() => ReviewStatus, { nullable: true })
	reviewStatus?: ReviewStatus;
}

/** Approve, request edit or hide — the three buttons on the admin's review card. */
@InputType()
export class ReviewModerationInput {
	@IsMongoId()
	@Field(() => String)
	reviewId!: string;

	@IsEnum(ReviewDecision)
	@Field(() => ReviewDecision)
	decision!: ReviewDecision;

	/** Required unless APPROVE — the patient must know what to fix. */
	@IsOptional()
	@Length(1, 1000)
	@Field(() => String, { nullable: true })
	reviewNote?: string;

	@IsOptional()
	@IsArray()
	@ArrayMaxSize(6)
	@ArrayUnique()
	@IsEnum(ReviewFlag, { each: true })
	@Field(() => [ReviewFlag], { nullable: true })
	reviewFlags?: ReviewFlag[];
}
