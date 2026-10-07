import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, ObjectId } from 'mongoose';
import { Clinics } from '../../libs/dto/clinic/clinic';
import { Doctors } from '../../libs/dto/doctor/doctor';
import { OrdinaryInquiry } from '../../libs/dto/common/inquiry';
import { ClinicStatus } from '../../libs/enums/clinic.enum';
import { DoctorStatus } from '../../libs/enums/doctor.enum';
import { LikeGroup } from '../../libs/enums/like.enum';
import { T } from '../../libs/types/common';

const DUPLICATE_KEY = 11000;

export interface LikeInput {
	memberId: ObjectId;
	likeGroup: LikeGroup;
	likeRefId: ObjectId;
}

@Injectable()
export class LikeService {
	constructor(@InjectModel('Like') private readonly likeModel: Model<T>) {}

	/**
	 * Returns the change for the target's counter: +1 liked, -1 unliked, 0 nothing changed.
	 *
	 * Reading first (findOne) and then inserting or deleting is racy: two clicks arriving together
	 * both read "not liked", both insert, and the counter goes up twice. Here the write
	 * itself decides: delete wins only if a like existed, insert wins only once — the unique
	 * index refuses the second — and the loser reports 0.
	 */
	public async toggleLike(input: LikeInput): Promise<number> {
		const { deletedCount } = await this.likeModel
			.deleteOne({ memberId: input.memberId, likeRefId: input.likeRefId })
			.exec();
		if (deletedCount > 0) return -1;

		try {
			await this.likeModel.create(input);
			return 1;
		} catch (err: any) {
			if (err?.code === DUPLICATE_KEY) return 0;
			throw err;
		}
	}

	public async isLiked(memberId: ObjectId, likeRefId: ObjectId): Promise<boolean> {
		return !!(await this.likeModel.exists({ memberId, likeRefId }).exec());
	}

	/** My Favorites → Clinics tab. A clinic that is no longer ACTIVE drops out of the list. */
	public async getFavoriteClinics(memberId: ObjectId, input: OrdinaryInquiry): Promise<Clinics> {
		const { page, limit } = input;

		const result = await this.likeModel
			.aggregate([
				{ $match: { memberId, likeGroup: LikeGroup.CLINIC } },
				{ $sort: { createdAt: -1 } },
				{
					$lookup: {
						from: 'clinics',
						localField: 'likeRefId',
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

	/** My Favorites → Doctors tab. A doctor drops out when the doctor or the clinic is not ACTIVE. */
	public async getFavoriteDoctors(memberId: ObjectId, input: OrdinaryInquiry): Promise<Doctors> {
		const { page, limit } = input;

		const result = await this.likeModel
			.aggregate([
				{ $match: { memberId, likeGroup: LikeGroup.DOCTOR } },
				{ $sort: { createdAt: -1 } },
				{
					$lookup: {
						from: 'doctors',
						localField: 'likeRefId',
						foreignField: '_id',
						pipeline: [
							{ $match: { doctorStatus: DoctorStatus.ACTIVE } },
							{
								$lookup: {
									from: 'clinics',
									localField: 'clinicId',
									foreignField: '_id',
									pipeline: [{ $match: { clinicStatus: ClinicStatus.ACTIVE } }],
									as: 'clinicData',
								},
							},
							{ $unwind: '$clinicData' },
						],
						as: 'doctor',
					},
				},
				{ $unwind: '$doctor' },
				{
					$facet: {
						list: [
							{ $skip: (page - 1) * limit },
							{ $limit: limit },
							{ $replaceRoot: { newRoot: '$doctor' } },
						],
						metaCounter: [{ $count: 'total' }],
					},
				},
			])
			.exec();

		return result[0] as Doctors;
	}
}
