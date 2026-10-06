import { Field, Float, Int, ObjectType } from '@nestjs/graphql';
import type { ObjectId } from 'mongoose';
import { ClinicStatus, District, Specialty } from '../../enums/clinic.enum';
import { Language } from '../../enums/common.enum';
import { Member, TotalCounter } from '../member/member';

@ObjectType()
export class ClinicHour {
	@Field(() => Int)
	day!: number;

	@Field(() => String, { nullable: true })
	open?: string;

	@Field(() => String, { nullable: true })
	close?: string;

	@Field(() => Boolean)
	closed!: boolean;
}

@ObjectType()
export class GeoPoint {
	@Field(() => String)
	type!: string;

	/** [lng, lat] — GeoJSON order, longitude first. */
	@Field(() => [Float])
	coordinates!: number[];
}

@ObjectType()
export class Clinic {
	@Field(() => String)
	_id!: ObjectId;

	@Field(() => ClinicStatus)
	clinicStatus!: ClinicStatus;

	@Field(() => String)
	clinicName!: string;

	@Field(() => String, { nullable: true })
	clinicNameKo?: string;

	@Field(() => Specialty)
	clinicSpecialty!: Specialty;

	@Field(() => District)
	clinicDistrict!: District;

	@Field(() => String)
	clinicAddress!: string;

	@Field(() => GeoPoint, { nullable: true })
	clinicLocation?: GeoPoint;

	@Field(() => String, { nullable: true })
	clinicPhone?: string;

	@Field(() => [ClinicHour])
	clinicHours!: ClinicHour[];

	@Field(() => [Language])
	clinicLangs!: Language[];

	@Field(() => [Language])
	clinicInterpreterLangs!: Language[];

	@Field(() => String)
	clinicLogo!: string;

	@Field(() => [String])
	clinicImages!: string[];

	@Field(() => String)
	clinicDesc!: string;

	@Field(() => String, { nullable: true })
	clinicReviewNote?: string;

	@Field(() => Int)
	clinicLikes!: number;

	@Field(() => Int)
	clinicFollowers!: number;

	@Field(() => Int)
	clinicViews!: number;

	@Field(() => String)
	memberId!: ObjectId;

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

	/** Per viewer, never cached: set only when a signed-in member opens the page. */
	@Field(() => Boolean, { nullable: true })
	meLiked?: boolean;

	@Field(() => Boolean, { nullable: true })
	meFollowed?: boolean;

	/** The AGENT account (manager name, work email). Filled only for admin queries. */
	@Field(() => Member, { nullable: true })
	memberData?: Member;
}

@ObjectType()
export class Clinics {
	@Field(() => [Clinic])
	list!: Clinic[];

	@Field(() => [TotalCounter], { nullable: true })
	metaCounter!: TotalCounter[];
}
