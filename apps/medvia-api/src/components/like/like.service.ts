import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, ObjectId, Types } from 'mongoose';
import { Clinics } from '../../libs/dto/clinic/clinic';
import { Doctors } from '../../libs/dto/doctor/doctor';
import { OrdinaryInquiry } from '../../libs/dto/common/inquiry';
import { LikeResult, LikeTargetInput } from '../../libs/dto/like/like';
import { ClinicStatus } from '../../libs/enums/clinic.enum';
import { DoctorStatus } from '../../libs/enums/doctor.enum';
import { LikeGroup } from '../../libs/enums/like.enum';
import { Messages } from '../../libs/enums/common.enum';
import { T } from '../../libs/types/common';
import { shapeIntoMongoObjectId } from '../../libs/config';

const DUPLICATE_KEY = 11000;

export interface LikeInput {
	memberId: ObjectId;
	likeGroup: LikeGroup;
	likeRefId: ObjectId;
}

/**
 * What a likeable module tells this one: whether a target may be liked right now, and how
 * to move and read its counter. ClinicService and DoctorService register one each on boot;
 * an M8 article registers its own — likeTarget itself never changes (open/closed).
 */
export interface LikeTargetHandler {
	isLikeable(refId: ObjectId): Promise<boolean>;
	/** Applies +1 / -1 and returns the new count. */
	moveLikes(refId: ObjectId, modifier: number): Promise<number>;
	countLikes(refId: ObjectId): Promise<number>;
}

@Injectable()
export class LikeService {
	private readonly handlers = new Map<LikeGroup, LikeTargetHandler>();

	constructor(@InjectModel('Like') private readonly likeModel: Model<T>) {}

	/**
	 * Called from the target module's onModuleInit. The dependency stays one-way: clinic and
	 * doctor import this module; this module never imports them.
	 */
	public registerTarget(likeGroup: LikeGroup, handler: LikeTargetHandler): void {
		this.handlers.set(likeGroup, handler);
	}

	/** The heart button, for any registered group. */
	public async likeTarget(memberId: ObjectId, input: LikeTargetInput): Promise<LikeResult> {
		const handler = this.handlers.get(input.likeGroup);
		if (!handler) throw new BadRequestException(Messages.BAD_REQUEST);
		if (!Types.ObjectId.isValid(input.likeRefId))
			throw new NotFoundException(Messages.NO_DATA_FOUND);

		const likeRefId = shapeIntoMongoObjectId(input.likeRefId) as ObjectId;
		if (!(await handler.isLikeable(likeRefId))) throw new NotFoundException(Messages.NO_DATA_FOUND);

		const modifier = await this.toggleLike({ memberId, likeGroup: input.likeGroup, likeRefId });
		const likes =
			modifier !== 0
				? await handler.moveLikes(likeRefId, modifier)
				: await handler.countLikes(likeRefId);

		// 0 means a twin request already inserted the like: the heart is on either way.
		return {
			likeGroup: input.likeGroup,
			likeRefId: input.likeRefId,
			meLiked: modifier >= 0,
			likes,
		};
	}

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

	/**
	 * Which of these targets has the member liked? One `$in` query for a whole page instead of
	 * one query per card; served by the unique { memberId, likeRefId } index. The caller says
	 * which field is the reference (a card's _id, a comment's _id ...).
	 */
	public async likedIds(memberId: ObjectId, refIds: unknown[]): Promise<Set<string>> {
		if (refIds.length === 0) return new Set();
		const rows = await this.likeModel
			.find(
				{ memberId, likeRefId: { $in: refIds.map((id) => shapeIntoMongoObjectId(String(id))) } },
				{ likeRefId: 1 },
			)
			.lean()
			.exec();
		return new Set(rows.map((row) => String(row.likeRefId)));
	}

	public async isLiked(memberId: ObjectId, likeRefId: unknown): Promise<boolean> {
		return (await this.likedIds(memberId, [likeRefId])).has(String(likeRefId));
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
