import { Field, InputType, Int } from '@nestjs/graphql';
import {
	ArrayMaxSize,
	ArrayUnique,
	IsArray,
	IsEmail,
	IsEnum,
	IsIn,
	IsInt,
	IsMongoId,
	IsOptional,
	Length,
	Matches,
	Max,
	Min,
	ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { DoctorStatus } from '../../enums/doctor.enum';
import { Specialty } from '../../enums/clinic.enum';
import { Direction, Language } from '../../enums/common.enum';
import { availableDoctorSorts, UPLOADED_IMAGE_PATTERN } from '../../config';
import { PASSWORD_MAX, PASSWORD_MIN } from '../member/member.input';

/**
 * "Add a doctor" in the clinic dashboard. The clinic picks the login email and a temporary
 * password; the account works at once and is flagged memberMustChangePassword.
 */
@InputType()
export class DoctorCreateInput {
	@IsEmail()
	@Field(() => String)
	memberEmail!: string;

	@Length(PASSWORD_MIN, PASSWORD_MAX)
	@Field(() => String)
	memberPassword!: string;

	@Length(2, 60)
	@Field(() => String)
	doctorName!: string;

	@IsOptional()
	@Length(1, 60)
	@Field(() => String, { nullable: true })
	doctorNameKo?: string;

	@IsEnum(Specialty)
	@Field(() => Specialty)
	doctorSpecialty!: Specialty;

	@IsOptional()
	@IsArray()
	@ArrayMaxSize(6)
	@ArrayUnique()
	@IsEnum(Language, { each: true })
	@Field(() => [Language], { nullable: true })
	doctorLangs?: Language[];

	@IsOptional()
	@IsInt()
	@Min(0)
	@Max(60)
	@Field(() => Int, { nullable: true })
	doctorExperience?: number;
}

@InputType()
export class CareerItemInput {
	@Length(1, 100)
	@Field(() => String)
	title!: string;

	@IsOptional()
	@Length(1, 100)
	@Field(() => String, { nullable: true })
	place?: string;

	@IsOptional()
	@Length(1, 20)
	@Field(() => String, { nullable: true })
	from?: string;

	@IsOptional()
	@Length(1, 20)
	@Field(() => String, { nullable: true })
	to?: string;
}

/**
 * The doctor's own profile page. No specialty, clinic or status: "Specialty and clinic are
 * set by the clinic", and the GraphQL schema rejects those fields before validation runs.
 */
@InputType()
export class DoctorProfileUpdate {
	@IsOptional()
	@Length(2, 60)
	@Field(() => String, { nullable: true })
	doctorName?: string;

	@IsOptional()
	@Length(1, 60)
	@Field(() => String, { nullable: true })
	doctorNameKo?: string;

	@IsOptional()
	@Matches(UPLOADED_IMAGE_PATTERN, {
		message: 'doctorImage must be a path returned by /upload/image',
	})
	@Field(() => String, { nullable: true })
	doctorImage?: string;

	@IsOptional()
	@IsInt()
	@Min(0)
	@Max(60)
	@Field(() => Int, { nullable: true })
	doctorExperience?: number;

	@IsOptional()
	@IsArray()
	@ArrayMaxSize(6)
	@ArrayUnique()
	@IsEnum(Language, { each: true })
	@Field(() => [Language], { nullable: true })
	doctorLangs?: Language[];

	@IsOptional()
	@Length(0, 2000)
	@Field(() => String, { nullable: true })
	doctorBio?: string;

	/** Replaces the whole list. */
	@IsOptional()
	@IsArray()
	@ArrayMaxSize(10)
	@ValidateNested({ each: true })
	@Type(() => CareerItemInput)
	@Field(() => [CareerItemInput], { nullable: true })
	doctorCareer?: CareerItemInput[];
}

/** What the clinic may change on a doctor's page. */
@InputType()
export class DoctorClinicUpdate {
	@IsMongoId()
	@Field(() => String)
	doctorId!: string;

	@IsEnum(Specialty)
	@Field(() => Specialty)
	doctorSpecialty!: Specialty;
}

@InputType()
export class DoctorPasswordReset {
	@IsMongoId()
	@Field(() => String)
	doctorId!: string;

	/** A new temporary password; the doctor is asked to change it again. */
	@Length(PASSWORD_MIN, PASSWORD_MAX)
	@Field(() => String)
	newPassword!: string;
}

@InputType()
class DISearch {
	/** Doctor name in English or Korean. */
	@IsOptional()
	@Length(1, 100)
	@Field(() => String, { nullable: true })
	text?: string;

	@IsOptional()
	@IsEnum(Specialty)
	@Field(() => Specialty, { nullable: true })
	specialty?: Specialty;

	/** Doctors who consult in at least one of these. */
	@IsOptional()
	@IsArray()
	@ArrayMaxSize(6)
	@IsEnum(Language, { each: true })
	@Field(() => [Language], { nullable: true })
	langs?: Language[];

	/** The doctors of one clinic — the clinic page. */
	@IsOptional()
	@IsMongoId()
	@Field(() => String, { nullable: true })
	clinicId?: string;
}

@InputType()
export class DoctorsInquiry {
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
	@IsIn(availableDoctorSorts)
	@Field(() => String, { nullable: true })
	sort?: string;

	@IsOptional()
	@IsEnum(Direction)
	@Field(() => Direction, { nullable: true })
	direction?: Direction;

	@IsOptional()
	@ValidateNested()
	@Type(() => DISearch)
	@Field(() => DISearch, { nullable: true })
	search?: DISearch;
}

@InputType()
export class AdminDoctorsInquiry {
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
	@IsEnum(DoctorStatus)
	@Field(() => DoctorStatus, { nullable: true })
	doctorStatus?: DoctorStatus;

	@IsOptional()
	@Length(1, 100)
	@Field(() => String, { nullable: true })
	text?: string;
}

@InputType()
export class DoctorStatusInput {
	@IsMongoId()
	@Field(() => String)
	doctorId!: string;

	/** Kept in the audit log only. */
	@IsOptional()
	@Length(1, 1000)
	@Field(() => String, { nullable: true })
	note?: string;
}
