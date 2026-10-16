import { Field, Int, ObjectType } from '@nestjs/graphql';
import type { ObjectId } from 'mongoose';
import { MemberType } from '../../enums/member.enum';
import { TotalCounter } from '../member/member';
import { Clinic } from '../clinic/clinic';
import { Doctor } from '../doctor/doctor';

/**
 * What one member may see of another. Never the Member type itself: that carries the
 * email and phone, and a follow list is readable by the follower, not by the followed.
 */
@ObjectType()
export class PublicMember {
	@Field(() => String)
	_id!: ObjectId;

	@Field(() => MemberType)
	memberType!: MemberType;

	/** "Feride K." for patients, the full name for clinics and doctors. */
	@Field(() => String)
	memberDisplayName!: string;

	@Field(() => String)
	memberImage!: string;
}

@ObjectType()
export class Follow {
	@Field(() => String)
	_id!: ObjectId;

	@Field(() => String)
	followingId!: ObjectId;

	@Field(() => MemberType)
	followingType!: MemberType;

	@Field(() => String)
	followerId!: ObjectId;

	@Field(() => Date)
	createdAt!: Date;

	@Field(() => PublicMember, { nullable: true })
	followingMember?: PublicMember;

	/** Set when the followed member is a clinic account: the card shows the clinic. */
	@Field(() => Clinic, { nullable: true })
	followingClinic?: Clinic;

	/** Set when the followed member is a doctor: the doctor card, with its clinic. */
	@Field(() => Doctor, { nullable: true })
	followingDoctor?: Doctor;
}

@ObjectType()
export class FollowTypeCount {
	@Field(() => MemberType)
	followingType!: MemberType;

	@Field(() => Int)
	total!: number;
}

@ObjectType()
export class Followings {
	@Field(() => [Follow])
	list!: Follow[];

	@Field(() => [TotalCounter], { nullable: true })
	metaCounter!: TotalCounter[];

	/** Tab badges — Clinics (4), Doctors (6), Community authors (2) — in the same query. */
	@Field(() => [FollowTypeCount])
	typeCounts!: FollowTypeCount[];
}
