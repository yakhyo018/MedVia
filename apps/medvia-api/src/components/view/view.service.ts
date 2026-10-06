import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, ObjectId } from 'mongoose';
import { Clinics } from '../../libs/dto/clinic/clinic';
import { OrdinaryInquiry } from '../../libs/dto/common/inquiry';
import { ClinicStatus } from '../../libs/enums/clinic.enum';
import { ViewGroup } from '../../libs/enums/view.enum';
import { T } from '../../libs/types/common';

const DUPLICATE_KEY = 11000;

export interface ViewInput {
	memberId: ObjectId;
	viewGroup: ViewGroup;
	viewRefId: ObjectId;
}

@Injectable()
export class ViewService {
	constructor(@InjectModel('View') private readonly viewModel: Model<T>) {}

	/**
	 * True only on the member's first visit — the caller then bumps the counter.
	 * One upsert instead of find-then-insert: a revisit just refreshes updatedAt
	 * (Recently Visited moves it to the top), and two tabs opening the page together
	 * cannot both count as "first", because the unique index refuses the second insert.
	 */
	public async recordView(input: ViewInput): Promise<boolean> {
		try {
			const result = await this.viewModel
				.updateOne(
					{ memberId: input.memberId, viewRefId: input.viewRefId },
					{ $set: { viewGroup: input.viewGroup } },
					{ upsert: true },
				)
				.exec();
			return result.upsertedCount > 0;
		} catch (err: any) {
			if (err?.code === DUPLICATE_KEY) return false;
			throw err;
		}
	}

	/** Recently Visited → clinics, latest visit first. */
	public async getVisitedClinics(memberId: ObjectId, input: OrdinaryInquiry): Promise<Clinics> {
		const { page, limit } = input;

		const result = await this.viewModel
			.aggregate([
				{ $match: { memberId, viewGroup: ViewGroup.CLINIC } },
				{ $sort: { updatedAt: -1 } },
				{
					$lookup: {
						from: 'clinics',
						localField: 'viewRefId',
						foreignField: '_id',
						pipeline: [{ $match: { clinicStatus: ClinicStatus.ACTIVE } }],
						as: 'clinic',
					},
				},
				{ $unwind: '$clinic' },
				{
					$facet: {
						list: [
							{ $skip: (page - 1) * limit },
							{ $limit: limit },
							{ $replaceRoot: { newRoot: '$clinic' } },
						],
						metaCounter: [{ $count: 'total' }],
					},
				},
			])
			.exec();

		return result[0] as Clinics;
	}
}
