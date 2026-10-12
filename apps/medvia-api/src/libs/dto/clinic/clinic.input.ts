import { Field, Float, InputType, Int } from '@nestjs/graphql';
import {
	ArrayMaxSize,
	Equals,
	IsArray,
	IsBoolean,
	IsEmail,
	IsEnum,
	IsIn,
	IsInt,
	IsLatitude,
	IsLongitude,
	IsMongoId,
	IsOptional,
	Length,
	Matches,
	Max,
	Min,
	ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ClinicStatus, District, Specialty } from '../../enums/clinic.enum';
import { ReviewDecision } from '../../enums/admin.enum';
import { Direction, Language } from '../../enums/common.enum';
import { availableClinicSorts } from '../../config';
import { PASSWORD_MAX, PASSWORD_MIN, PHONE_PATTERN } from '../member/member.input';

/**
 * The clinic signup form: the AGENT account and the clinic in one request, created in
 * one transaction. Photos, hours and languages come later from the clinic profile page.
 */
@InputType()
export class ClinicSignupInput {
	@IsEmail()
	@Field(() => String)
	memberEmail!: string;

	@Length(PASSWORD_MIN, PASSWORD_MAX)
	@Field(() => String)
	memberPassword!: string;

	/** The manager's name — the person the admin contacts. */
	@Length(2, 60)
	@Field(() => String)
	memberFullName!: string;

	@Length(2, 100)
	@Field(() => String)
	clinicName!: string;

	@IsOptional()
	@Length(1, 100)
	@Field(() => String, { nullable: true })
	clinicNameKo?: string;

	@IsEnum(Specialty)
	@Field(() => Specialty)
	clinicSpecialty!: Specialty;

	@IsEnum(District)
	@Field(() => District)
	clinicDistrict!: District;

	@Length(5, 200)
	@Field(() => String)
	clinicAddress!: string;

	@IsOptional()
	@Matches(PHONE_PATTERN, { message: 'clinicPhone is not a valid phone number' })
	@Field(() => String, { nullable: true })
	clinicPhone?: string;

	@Equals(true, { message: 'termsAccepted must be true' })
	@Field(() => Boolean)
	termsAccepted!: boolean;

	/** "I am authorised to register this clinic." */
	@Equals(true, { message: 'authorizedConfirmed must be true' })
	@Field(() => Boolean)
	authorizedConfirmed!: boolean;
}

@InputType()
export class ClinicHourInput {
	@IsInt()
	@Min(0)
	@Max(6)
	@Field(() => Int)
	day!: number;

	@IsOptional()
	@Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'open must be HH:mm' })
	@Field(() => String, { nullable: true })
	open?: string;

	@IsOptional()
	@Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'close must be HH:mm' })
	@Field(() => String, { nullable: true })
	close?: string;

	@IsOptional()
	@IsBoolean()
	@Field(() => Boolean, { nullable: true })
	closed?: boolean;
}

/** A map pin. Stored as GeoJSON [lng, lat]; taken as named fields so the order cannot be swapped. */
@InputType()
export class LocationInput {
	@IsLongitude()
	@Field(() => Float)
	lng!: number;

	@IsLatitude()
	@Field(() => Float)
	lat!: number;
}

@InputType()
class CISearch {
	/** Clinic name in English or Korean, or words from the description. */
	/** Exactly this treatment name, e.g. "Laser Toning" from the trending list (text is fuzzy). */
	@IsOptional()
	@Length(1, 100)
	@Field(() => String, { nullable: true })
	treatment?: string;

	@IsOptional()
	@Length(1, 100)
	@Field(() => String, { nullable: true })
	text?: string;

	@IsOptional()
	@IsEnum(Specialty)
	@Field(() => Specialty, { nullable: true })
	specialty?: Specialty;

	@IsOptional()
	@IsArray()
	@ArrayMaxSize(7)
	@IsEnum(District, { each: true })
	@Field(() => [District], { nullable: true })
	districts?: District[];

	/** Clinics that speak at least one of these at reception. */
	@IsOptional()
	@IsArray()
	@ArrayMaxSize(6)
	@IsEnum(Language, { each: true })
	@Field(() => [Language], { nullable: true })
	langs?: Language[];

	/** "Price range": clinics whose cheapest live treatment is within it (KRW). */
	@IsOptional()
	@IsInt()
	@Min(0)
	@Field(() => Int, { nullable: true })
	priceMin?: number;

	@IsOptional()
	@IsInt()
	@Min(0)
	@Field(() => Int, { nullable: true })
	priceMax?: number;

	/** Only clinics with an interpreter — for one of `langs` when those are given. */
	@IsOptional()
	@IsBoolean()
	@Field(() => Boolean, { nullable: true })
	interpreter?: boolean;
}

@InputType()
export class ClinicsInquiry {
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
	@IsIn(availableClinicSorts)
	@Field(() => String, { nullable: true })
	sort?: string;

	@IsOptional()
	@IsEnum(Direction)
	@Field(() => Direction, { nullable: true })
	direction?: Direction;

	@IsOptional()
	@ValidateNested()
	@Type(() => CISearch)
	@Field(() => CISearch, { nullable: true })
	search?: CISearch;
}

@InputType()
export class AdminClinicsInquiry {
	@IsInt()
	@Min(1)
	@Field(() => Int)
	page!: number;

	@IsInt()
	@Min(1)
	@Max(100)
	@Field(() => Int)
	limit!: number;

	/** PENDING is the verification queue: oldest submission first. */
	@IsOptional()
	@IsEnum(ClinicStatus)
	@Field(() => ClinicStatus, { nullable: true })
	clinicStatus?: ClinicStatus;

	@IsOptional()
	@Length(1, 100)
	@Field(() => String, { nullable: true })
	text?: string;
}

@InputType()
export class ClinicReviewInput {
	@IsMongoId()
	@Field(() => String)
	clinicId!: string;

	@IsEnum(ReviewDecision)
	@Field(() => ReviewDecision)
	decision!: ReviewDecision;

	/** Required for REQUEST_CHANGES and REJECT — the clinic must know what to fix. */
	@IsOptional()
	@Length(1, 1000)
	@Field(() => String, { nullable: true })
	clinicReviewNote?: string;
}

@InputType()
export class ClinicStatusInput {
	@IsMongoId()
	@Field(() => String)
	clinicId!: string;

	/** Kept in the audit log only. */
	@IsOptional()
	@Length(1, 1000)
	@Field(() => String, { nullable: true })
	note?: string;
}
