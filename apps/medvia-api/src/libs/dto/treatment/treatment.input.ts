import { Field, InputType, Int } from '@nestjs/graphql';
import {
	ArrayMaxSize,
	ArrayMinSize,
	ArrayUnique,
	IsArray,
	IsBoolean,
	IsDate,
	IsEnum,
	IsInt,
	IsMongoId,
	IsOptional,
	Length,
	Matches,
	Max,
	Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { TreatmentCategory, TreatmentStatus } from '../../enums/treatment.enum';
import { Language } from '../../enums/common.enum';
import { ReviewDecision } from '../../enums/admin.enum';
import { UPLOADED_IMAGE_PATTERN } from '../../config';

const MAX_PRICE = 100_000_000;

/** "Add Treatment" in the clinic dashboard. New treatments wait for the admin (PENDING). */
@InputType()
export class TreatmentCreateInput {
	@Length(2, 80)
	@Field(() => String)
	treatmentName!: string;

	@IsEnum(TreatmentCategory)
	@Field(() => TreatmentCategory)
	treatmentCategory!: TreatmentCategory;

	@IsInt()
	@Min(10)
	@Max(240)
	@Field(() => Int)
	treatmentDuration!: number;

	@IsInt()
	@Min(0)
	@Max(MAX_PRICE)
	@Field(() => Int)
	treatmentPrice!: number;

	@IsOptional()
	@Length(0, 100)
	@Field(() => String, { nullable: true })
	treatmentPriceNote?: string;

	@IsOptional()
	@Length(0, 2000)
	@Field(() => String, { nullable: true })
	treatmentDesc?: string;

	@IsOptional()
	@Length(0, 1000)
	@Field(() => String, { nullable: true })
	treatmentAftercare?: string;

	@IsOptional()
	@IsArray()
	@ArrayMaxSize(6)
	@ArrayUnique()
	@IsEnum(Language, { each: true })
	@Field(() => [Language], { nullable: true })
	treatmentLangs?: Language[];

	@IsOptional()
	@IsArray()
	@ArrayMaxSize(6)
	@ArrayUnique()
	@Matches(UPLOADED_IMAGE_PATTERN, {
		each: true,
		message: 'treatmentImages must be paths returned by /upload/image',
	})
	@Field(() => [String], { nullable: true })
	treatmentImages?: string[];

	/** "Patients choose one of these doctors when they book. At least one is required." */
	@IsArray()
	@ArrayMinSize(1)
	@ArrayMaxSize(20)
	@ArrayUnique()
	@IsMongoId({ each: true })
	@Field(() => [String])
	doctorIds!: string[];
}

/**
 * One form for every edit. What happens to each field depends on the treatment's state:
 * before the first approval everything applies at once (it is still under review); on a live
 * treatment the medical-ad fields and a lower price wait in the draft, the rest applies now.
 */
@InputType()
export class TreatmentUpdate {
	@IsMongoId()
	@Field(() => String)
	treatmentId!: string;

	@IsOptional()
	@Length(2, 80)
	@Field(() => String, { nullable: true })
	treatmentName?: string;

	@IsOptional()
	@IsEnum(TreatmentCategory)
	@Field(() => TreatmentCategory, { nullable: true })
	treatmentCategory?: TreatmentCategory;

	@IsOptional()
	@IsInt()
	@Min(10)
	@Max(240)
	@Field(() => Int, { nullable: true })
	treatmentDuration?: number;

	@IsOptional()
	@IsInt()
	@Min(0)
	@Max(MAX_PRICE)
	@Field(() => Int, { nullable: true })
	treatmentPrice?: number;

	@IsOptional()
	@Length(0, 100)
	@Field(() => String, { nullable: true })
	treatmentPriceNote?: string;

	@IsOptional()
	@Length(0, 2000)
	@Field(() => String, { nullable: true })
	treatmentDesc?: string;

	@IsOptional()
	@Length(0, 1000)
	@Field(() => String, { nullable: true })
	treatmentAftercare?: string;

	@IsOptional()
	@IsArray()
	@ArrayMaxSize(6)
	@ArrayUnique()
	@IsEnum(Language, { each: true })
	@Field(() => [Language], { nullable: true })
	treatmentLangs?: Language[];

	@IsOptional()
	@IsArray()
	@ArrayMaxSize(6)
	@ArrayUnique()
	@Matches(UPLOADED_IMAGE_PATTERN, {
		each: true,
		message: 'treatmentImages must be paths returned by /upload/image',
	})
	@Field(() => [String], { nullable: true })
	treatmentImages?: string[];

	@IsOptional()
	@IsArray()
	@ArrayMinSize(1)
	@ArrayMaxSize(20)
	@ArrayUnique()
	@IsMongoId({ each: true })
	@Field(() => [String], { nullable: true })
	doctorIds?: string[];
}

/** The treatments on a clinic page; with doctorId, "Treatments by Dr. Han". */
@InputType()
export class ClinicTreatmentsInquiry {
	@IsMongoId()
	@Field(() => String)
	clinicId!: string;

	@IsOptional()
	@IsMongoId()
	@Field(() => String, { nullable: true })
	doctorId?: string;
}

@InputType()
export class AdminTreatmentsInquiry {
	@IsInt()
	@Min(1)
	@Field(() => Int)
	page!: number;

	@IsInt()
	@Min(1)
	@Max(100)
	@Field(() => Int)
	limit!: number;

	/** The "Pending" tab: new treatments and edits waiting for review, oldest first. */
	@IsOptional()
	@IsBoolean()
	@Field(() => Boolean, { nullable: true })
	reviewQueue?: boolean;

	@IsOptional()
	@IsEnum(TreatmentStatus)
	@Field(() => TreatmentStatus, { nullable: true })
	treatmentStatus?: TreatmentStatus;
}

/** Decides a new treatment (PENDING) or, on a live one, its waiting edit. */
@InputType()
export class TreatmentReviewInput {
	@IsMongoId()
	@Field(() => String)
	treatmentId!: string;

	@IsEnum(ReviewDecision)
	@Field(() => ReviewDecision)
	decision!: ReviewDecision;

	@IsOptional()
	@Length(1, 1000)
	@Field(() => String, { nullable: true })
	treatmentReviewNote?: string;

	/**
	 * For an edit: the draft version the admin looked at (treatmentDraft.submittedAt). If the
	 * clinic changed the draft since, the decision is refused instead of applying unseen text.
	 */
	@IsOptional()
	@IsDate()
	@Type(() => Date)
	@Field(() => Date, { nullable: true })
	draftSubmittedAt?: Date;
}
