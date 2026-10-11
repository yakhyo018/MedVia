import { Field, Float, Int, ObjectType } from '@nestjs/graphql';
import type { ObjectId } from 'mongoose';
import { DoctorStatus } from '../../enums/doctor.enum';
import { Specialty } from '../../enums/clinic.enum';
import { Language } from '../../enums/common.enum';
import { Member, TotalCounter } from '../member/member';
import { Clinic } from '../clinic/clinic';

@ObjectType()
export class CareerItem {
	@Field(() => String)
	title!: string;

	@Field(() => String, { nullable: true })
	place?: string;

	@Field(() => String, { nullable: true })
	from?: string;

	@Field(() => String, { nullable: true })
	to?: string;
}

@ObjectType()
export class Doctor {
	@Field(() => String)
	_id!: ObjectId;

	@Field(() => DoctorStatus)
	doctorStatus!: DoctorStatus;

	@Field(() => String)
	doctorName!: string;

	@Field(() => String, { nullable: true })
	doctorNameKo?: string;

	@Field(() => Specialty)
	doctorSpecialty!: Specialty;

	@Field(() => Int, { nullable: true })
	doctorExperience?: number;

	@Field(() => [Language])
	doctorLangs!: Language[];

	@Field(() => String)
	doctorBio!: string;

	@Field(() => String)
	doctorImage!: string;

	@Field(() => [CareerItem])
	doctorCareer!: CareerItem[];

	@Field(() => Int)
	doctorLikes!: number;

	@Field(() => Int)
	doctorViews!: number;

	@Field(() => Int)
	doctorFollowers!: number;

	/** Average of the ACTIVE reviews. Absent on doctors nobody has reviewed since M6. */
	@Field(() => Float, { nullable: true })
	doctorRating?: number;

	@Field(() => Int, { nullable: true })
	doctorReviews?: number;

	/** The nightly "Recommended" score (batch RANK); 0 before the first run. */
	@Field(() => Float, { nullable: true })
	doctorScore?: number;

	@Field(() => String)
	clinicId!: ObjectId;

	/** The DOCTOR account — what a patient follows. */
	@Field(() => String)
	memberId!: ObjectId;

	@Field(() => Date, { nullable: true })
	deletedAt?: Date;

	@Field(() => Date)
	createdAt!: Date;

	@Field(() => Date)
	updatedAt!: Date;

	/** Per viewer, never cached. */
	@Field(() => Boolean, { nullable: true })
	meLiked?: boolean;

	@Field(() => Boolean, { nullable: true })
	meFollowed?: boolean;

	/** The clinic card on the doctor page and in lists. */
	@Field(() => Clinic, { nullable: true })
	clinicData?: Clinic;

	/** The DOCTOR account (login email). Filled only for the clinic and admin views. */
	@Field(() => Member, { nullable: true })
	memberData?: Member;
}

@ObjectType()
export class Doctors {
	@Field(() => [Doctor])
	list!: Doctor[];

	@Field(() => [TotalCounter], { nullable: true })
	metaCounter!: TotalCounter[];
}
