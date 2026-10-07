import { Field, ObjectType } from '@nestjs/graphql';
import type { ObjectId } from 'mongoose';
import { ViewGroup } from '../../enums/view.enum';
import { TotalCounter } from '../member/member';
import { Clinic } from '../clinic/clinic';
import { Doctor } from '../doctor/doctor';

/** One row of the Recently Visited timeline: a clinic or a doctor (articles join in M8). */
@ObjectType()
export class RecentVisit {
	@Field(() => String)
	_id!: ObjectId;

	@Field(() => ViewGroup)
	viewGroup!: ViewGroup;

	@Field(() => String)
	viewRefId!: ObjectId;

	/** The latest visit. */
	@Field(() => Date)
	visitedAt!: Date;

	@Field(() => Clinic, { nullable: true })
	clinic?: Clinic;

	@Field(() => Doctor, { nullable: true })
	doctor?: Doctor;
}

@ObjectType()
export class RecentVisits {
	@Field(() => [RecentVisit])
	list!: RecentVisit[];

	@Field(() => [TotalCounter], { nullable: true })
	metaCounter!: TotalCounter[];
}
