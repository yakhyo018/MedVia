import { Field, Int, ObjectType } from '@nestjs/graphql';
import type { ObjectId } from 'mongoose';
import { TreatmentCategory, TreatmentStatus } from '../../enums/treatment.enum';
import { Language } from '../../enums/common.enum';
import { Specialty } from '../../enums/clinic.enum';
import { TotalCounter } from '../member/member';
import { Clinic } from '../clinic/clinic';
import { Doctor } from '../doctor/doctor';

/** An edit waiting for the admin. Only the fields that were changed are set. */
@ObjectType()
export class TreatmentDraft {
	@Field(() => String, { nullable: true })
	treatmentName?: string;

	@Field(() => TreatmentCategory, { nullable: true })
	treatmentCategory?: TreatmentCategory;

	@Field(() => Int, { nullable: true })
	treatmentPrice?: number;

	@Field(() => String, { nullable: true })
	treatmentPriceNote?: string;

	@Field(() => String, { nullable: true })
	treatmentDesc?: string;

	@Field(() => [String], { nullable: true })
	treatmentImages?: string[];

	@Field(() => Date)
	submittedAt!: Date;
}

@ObjectType()
export class Treatment {
	@Field(() => String)
	_id!: ObjectId;

	@Field(() => TreatmentStatus)
	treatmentStatus!: TreatmentStatus;

	@Field(() => String)
	treatmentName!: string;

	@Field(() => TreatmentCategory)
	treatmentCategory!: TreatmentCategory;

	@Field(() => Int)
	treatmentDuration!: number;

	@Field(() => Int)
	treatmentPrice!: number;

	@Field(() => String)
	treatmentPriceNote!: string;

	@Field(() => String)
	treatmentDesc!: string;

	@Field(() => String)
	treatmentAftercare!: string;

	@Field(() => [Language])
	treatmentLangs!: Language[];

	@Field(() => [String])
	treatmentImages!: string[];

	@Field(() => [String])
	doctorIds!: ObjectId[];

	@Field(() => String, { nullable: true })
	treatmentReviewNote?: string;

	/** Only for the clinic and the admin; public queries never return it. */
	@Field(() => TreatmentDraft, { nullable: true })
	treatmentDraft?: TreatmentDraft;

	@Field(() => String)
	clinicId!: ObjectId;

	@Field(() => Date)
	submittedAt!: Date;

	@Field(() => Date, { nullable: true })
	verifiedAt?: Date;

	@Field(() => Date, { nullable: true })
	deletedAt?: Date;

	@Field(() => Date)
	createdAt!: Date;

	@Field(() => Date)
	updatedAt!: Date;

	/** The doctor chips. Public pages show only doctors who are ACTIVE. */
	@Field(() => [Doctor], { nullable: true })
	doctors?: Doctor[];

	/** Filled for the admin queue. */
	@Field(() => Clinic, { nullable: true })
	clinicData?: Clinic;

	/** The clinic's own table only: confirmed visits in this Seoul month. */
	@Field(() => Int, { nullable: true })
	treatmentBookingsMonth?: number;
}

@ObjectType()
export class Treatments {
	@Field(() => [Treatment])
	list!: Treatment[];

	@Field(() => [TotalCounter], { nullable: true })
	metaCounter!: TotalCounter[];
}

/**
 * The landing page's "Trending treatments": one row per treatment name across live clinics,
 * with the bookings requested in the last 30 days.
 */
@ObjectType()
export class TrendingTreatment {
	@Field(() => String)
	treatmentName!: string;

	@Field(() => TreatmentCategory)
	treatmentCategory!: TreatmentCategory;

	/** The specialty of the clinics that offer it (the card's chip). */
	@Field(() => Specialty)
	specialty!: Specialty;

	/** The cheapest live price — "From ₩99,000". */
	@Field(() => Int)
	minPrice!: number;

	/** PENDING, CONFIRMED or COMPLETED requests created in the last 30 days. */
	@Field(() => Int)
	bookings!: number;

	/** Live clinics that offer it. */
	@Field(() => Int)
	clinics!: number;
}
