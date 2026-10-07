import { Field, Float, Int, ObjectType } from '@nestjs/graphql';
import type { ObjectId } from 'mongoose';
import { ReplierType, ReviewFlag, ReviewStatus, ReviewTag } from '../../enums/review.enum';
import { Language } from '../../enums/common.enum';
import { TotalCounter } from '../member/member';

@ObjectType()
export class ReviewReply {
	@Field(() => String)
	replyContent!: string;

	@Field(() => Language)
	replyLang!: Language;

	@Field(() => String)
	replierId!: ObjectId;

	@Field(() => ReplierType)
	replierType!: ReplierType;

	@Field(() => Date)
	repliedAt!: Date;
}

@ObjectType()
export class Review {
	@Field(() => String)
	_id!: ObjectId;

	@Field(() => ReviewStatus)
	reviewStatus!: ReviewStatus;

	@Field(() => Int)
	reviewRating!: number;

	@Field(() => [ReviewTag])
	reviewTags!: ReviewTag[];

	/** For the patient and the admin; public lists leave it out. */
	@Field(() => [ReviewFlag], { nullable: true })
	reviewFlags?: ReviewFlag[];

	@Field(() => String)
	reviewContent!: string;

	@Field(() => Language)
	reviewLang!: Language;

	@Field(() => ReviewReply, { nullable: true })
	reviewReply?: ReviewReply;

	/** The admin's message to the patient; public lists leave it out. */
	@Field(() => String, { nullable: true })
	reviewNote?: string;

	@Field(() => Date)
	submittedAt!: Date;

	@Field(() => String)
	bookingId!: ObjectId;

	@Field(() => String)
	memberId!: ObjectId;

	@Field(() => String)
	clinicId!: ObjectId;

	@Field(() => String)
	doctorId!: ObjectId;

	@Field(() => String)
	treatmentId!: ObjectId;

	@Field(() => Date)
	createdAt!: Date;

	@Field(() => Date)
	updatedAt!: Date;

	/** "Feride K." — patients are never shown by full name. */
	@Field(() => String, { nullable: true })
	patientName?: string;

	@Field(() => String, { nullable: true })
	clinicName?: string;

	@Field(() => String, { nullable: true })
	doctorName?: string;

	@Field(() => String, { nullable: true })
	treatmentName?: string;

	/** The date of the visit — "Verified visit · 8 Sep 2026". */
	@Field(() => Date, { nullable: true })
	visitDate?: Date;
}

@ObjectType()
export class RatingCount {
	@Field(() => Int)
	stars!: number;

	@Field(() => Int)
	count!: number;
}

/** "4.9 · 312 verified reviews" and the five bars. */
@ObjectType()
export class RatingSummary {
	@Field(() => Float)
	rating!: number;

	@Field(() => Int)
	reviews!: number;

	@Field(() => [RatingCount])
	distribution!: RatingCount[];
}

@ObjectType()
export class Reviews {
	@Field(() => [Review])
	list!: Review[];

	@Field(() => [TotalCounter], { nullable: true })
	metaCounter!: TotalCounter[];

	/** Public lists only: every published review of the filter, whatever the page. */
	@Field(() => RatingSummary, { nullable: true })
	summary?: RatingSummary;
}
