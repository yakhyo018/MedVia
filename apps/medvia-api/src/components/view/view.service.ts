import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, ObjectId } from 'mongoose';
import { OrdinaryInquiry } from '../../libs/dto/common/inquiry';
import { RecentVisits } from '../../libs/dto/view/view';
import { ClinicStatus } from '../../libs/enums/clinic.enum';
import { DoctorStatus } from '../../libs/enums/doctor.enum';
import { ViewGroup } from '../../libs/enums/view.enum';
import { T } from '../../libs/types/common';

const DUPLICATE_KEY = 11000;

export interface ViewInput {
	memberId: ObjectId;
	viewGroup: ViewGroup;
	viewRefId: ObjectId;
}

const ACTIVE_CLINIC = [{ $match: { clinicStatus: ClinicStatus.ACTIVE } }];

@Injectable()
export class ViewService {
	constructor(@InjectModel('View') private readonly viewModel: Model<T>) {}

	/**
	 * True only on the member's first visit — the caller then bumps the counter.
	 * One upsert instead of find-then-insert: a revisit just refreshes updatedAt
	 * (Recently Visited moves it to the top, and un-hides it after "Clear history"), and two
	 * tabs opening the page together cannot both count as "first", because the unique index
	 * refuses the second insert.
	 */
	public async recordView(input: ViewInput): Promise<boolean> {
		try {
			const result = await this.viewModel
				.updateOne(
					{ memberId: input.memberId, viewRefId: input.viewRefId },
					{ $set: { viewGroup: input.viewGroup, viewHidden: false } },
					{ upsert: true },
				)
				.exec();
			return result.upsertedCount > 0;
		} catch (err: any) {
			if (err?.code === DUPLICATE_KEY) return false;
			throw err;
		}
	}

	/**
	 * Recently Visited: one timeline of clinics and doctors, latest visit first. A clinic
	 * drops out when it is no longer ACTIVE; a doctor when the doctor or their clinic is not.
	 * The lookups run over the member's whole history before paging — a patient's history
	 * is dozens of rows, not thousands.
	 */
	public async getRecentlyVisited(
		memberId: ObjectId,
		input: OrdinaryInquiry,
	): Promise<RecentVisits> {
		const { page, limit } = input;

		const result = await this.viewModel
			.aggregate([
				{ $match: { memberId, viewHidden: { $ne: true } } },
				{ $sort: { updatedAt: -1 } },
				{
					$lookup: {
						from: 'clinics',
						localField: 'viewRefId',
						foreignField: '_id',
						pipeline: ACTIVE_CLINIC,
						as: 'clinic',
					},
				},
				{
					$lookup: {
						from: 'doctors',
						localField: 'viewRefId',
						foreignField: '_id',
						pipeline: [
							{ $match: { doctorStatus: DoctorStatus.ACTIVE } },
							{
								$lookup: {
									from: 'clinics',
									localField: 'clinicId',
									foreignField: '_id',
									pipeline: ACTIVE_CLINIC,
									as: 'clinicData',
								},
							},
							{ $unwind: '$clinicData' },
						],
						as: 'doctor',
					},
				},
				{ $match: { $or: [{ 'clinic.0': { $exists: true } }, { 'doctor.0': { $exists: true } }] } },
				{
					$facet: {
						list: [
							{ $skip: (page - 1) * limit },
							{ $limit: limit },
							{
								$project: {
									viewGroup: 1,
									viewRefId: 1,
									visitedAt: '$updatedAt',
									clinic: { $first: '$clinic' },
									doctor: { $first: '$doctor' },
								},
							},
						],
						metaCounter: [{ $count: 'total' }],
					},
				},
			])
			.exec();

		return result[0] as RecentVisits;
	}

	/**
	 * "Clear history": hide, never delete. A deleted row would make the next visit a first
	 * visit again and inflate the view counter. timestamps off — hiding is not a visit.
	 */
	public async clearRecentlyVisited(memberId: ObjectId): Promise<boolean> {
		await this.viewModel
			.updateMany(
				{ memberId, viewHidden: { $ne: true } },
				{ $set: { viewHidden: true } },
				{ timestamps: false },
			)
			.exec();
		return true;
	}
}
