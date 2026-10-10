import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, ObjectId } from 'mongoose';
import { Follow, Followings } from '../../libs/dto/follow/follow';
import { FollowInput, FollowingsInquiry } from '../../libs/dto/follow/follow.input';
import { Messages } from '../../libs/enums/common.enum';
import { ClinicStatus } from '../../libs/enums/clinic.enum';
import { DoctorStatus } from '../../libs/enums/doctor.enum';
import { FOLLOWABLE_MEMBER_TYPES, MemberStatus, MemberType } from '../../libs/enums/member.enum';
import { T } from '../../libs/types/common';
import { CacheKeys, shapeIntoMongoObjectId, toDisplayName } from '../../libs/config';
import { CacheService } from '../../redis/cache.service';
import { NotificationService } from '../notification/notification.service';
import { NotificationType } from '../../libs/enums/notification.enum';

const DUPLICATE_KEY = 11000;

/** Only what another member may see — no email, no phone. */
const PUBLIC_MEMBER_FIELDS = { _id: 1, memberType: 1, memberFullName: 1, memberImage: 1 };

/**
 * Member follows member. A followed clinic or doctor account also moves `clinicFollowers` /
 * `doctorFollowers`; this service does that through the Clinic and Doctor models rather than
 * their services, because ClinicModule and DoctorModule depend on this module (for
 * `meFollowed`) and the dependency must stay one-way.
 */
@Injectable()
export class FollowService {
	constructor(
		@InjectModel('Follow') private readonly followModel: Model<T>,
		@InjectModel('Member') private readonly memberModel: Model<T>,
		@InjectModel('Clinic') private readonly clinicModel: Model<T>,
		@InjectModel('Doctor') private readonly doctorModel: Model<T>,
		private readonly cacheService: CacheService,
		private readonly notificationService: NotificationService,
	) {}

	public async followMember(followerId: ObjectId, input: FollowInput): Promise<Follow> {
		const followingId = shapeIntoMongoObjectId(input.memberId);
		if (String(followingId) === String(followerId)) {
			throw new BadRequestException(Messages.SELF_SUBSCRIPTION_DENIED);
		}

		const target = await this.memberModel
			.findOne({ _id: followingId, memberStatus: MemberStatus.ACTIVE }, PUBLIC_MEMBER_FIELDS)
			.lean()
			.exec();
		if (!target || !FOLLOWABLE_MEMBER_TYPES.includes(target.memberType)) {
			throw new BadRequestException(Messages.FOLLOW_TARGET_INVALID);
		}

		// A clinic account is followable only once its clinic is live.
		let clinic: T | null = null;
		if (target.memberType === MemberType.AGENT) {
			clinic = await this.clinicModel
				.findOne({ memberId: followingId, clinicStatus: ClinicStatus.ACTIVE })
				.lean()
				.exec();
			if (!clinic) throw new BadRequestException(Messages.FOLLOW_TARGET_INVALID);
		}

		// A doctor is followable while both the doctor and their clinic are live.
		let doctor: T | null = null;
		if (target.memberType === MemberType.DOCTOR) {
			doctor = await this.doctorModel
				.findOne({ memberId: followingId, doctorStatus: DoctorStatus.ACTIVE })
				.lean()
				.exec();
			const clinicLive =
				!!doctor &&
				!!(await this.clinicModel
					.exists({ _id: doctor.clinicId, clinicStatus: ClinicStatus.ACTIVE })
					.exec());
			if (!clinicLive) throw new BadRequestException(Messages.FOLLOW_TARGET_INVALID);
		}

		let follow: T;
		try {
			follow = (
				await this.followModel.create({
					followingId,
					followingType: target.memberType,
					followerId,
				})
			).toObject();
		} catch (err: any) {
			if (err?.code === DUPLICATE_KEY) throw new BadRequestException(Messages.ALREADY_FOLLOWING);
			throw err;
		}

		if (clinic) {
			clinic = await this.clinicModel
				.findByIdAndUpdate(clinic._id, { $inc: { clinicFollowers: 1 } }, { new: true })
				.lean()
				.exec();
			await this.cacheService.del(CacheKeys.clinicDetail(clinic?._id));
		}
		if (doctor) {
			doctor = await this.doctorModel
				.findByIdAndUpdate(doctor._id, { $inc: { doctorFollowers: 1 } }, { new: true })
				.lean()
				.exec();
			await this.cacheService.del(CacheKeys.doctorDetail(doctor?._id));
		}
		await this.notifyFollowed(followerId, followingId);

		return {
			...follow,
			followingMember: this.toPublicMember(target),
			followingClinic: clinic ?? undefined,
			followingDoctor: doctor ?? undefined,
		} as Follow;
	}

	/** True when something was removed; refuses an unfollow that has nothing to undo. */
	public async unfollowMember(followerId: ObjectId, input: FollowInput): Promise<boolean> {
		const followingId = shapeIntoMongoObjectId(input.memberId);
		const removed = await this.followModel
			.findOneAndDelete({ followingId, followerId })
			.lean()
			.exec();
		if (!removed) throw new BadRequestException(Messages.NOT_FOLLOWING);

		if (removed.followingType === MemberType.AGENT) {
			// Any status: a suspended clinic still loses the follower. Never below zero.
			const clinic = await this.clinicModel
				.findOneAndUpdate(
					{ memberId: followingId, clinicFollowers: { $gt: 0 } },
					{ $inc: { clinicFollowers: -1 } },
					{ new: true },
				)
				.lean()
				.exec();
			if (clinic) await this.cacheService.del(CacheKeys.clinicDetail(clinic._id));
		}
		if (removed.followingType === MemberType.DOCTOR) {
			const doctor = await this.doctorModel
				.findOneAndUpdate(
					{ memberId: followingId, doctorFollowers: { $gt: 0 } },
					{ $inc: { doctorFollowers: -1 } },
					{ new: true },
				)
				.lean()
				.exec();
			if (doctor) await this.cacheService.del(CacheKeys.doctorDetail(doctor._id));
		}
		return true;
	}

	/**
	 * Which of these members does the follower follow? One `$in` query for a page of cards,
	 * served by the unique { followingId, followerId } index. The caller passes the reference
	 * field: a clinic card's memberId, a doctor card's memberId, an author's id.
	 */
	public async followedIds(followerId: ObjectId, memberIds: unknown[]): Promise<Set<string>> {
		if (memberIds.length === 0) return new Set();
		const rows = await this.followModel
			.find(
				{
					followerId,
					followingId: { $in: memberIds.map((id) => shapeIntoMongoObjectId(String(id))) },
				},
				{ followingId: 1 },
			)
			.lean()
			.exec();
		return new Set(rows.map((row) => String(row.followingId)));
	}

	public async isFollowing(followerId: ObjectId, followingId: unknown): Promise<boolean> {
		return (await this.followedIds(followerId, [followingId])).has(String(followingId));
	}

	/**
	 * My Followings. The $sort sits before $facet on purpose: a $facet sub-pipeline never
	 * uses an index, so a sort inside it would sort every follow of this member in memory.
	 * Before $facet, { followerId, createdAt: -1 } serves both the match and the order.
	 */
	public async getMyFollowings(
		followerId: ObjectId,
		input: FollowingsInquiry,
	): Promise<Followings> {
		const { page, limit, followingType } = input;
		const typeMatch = followingType ? [{ $match: { followingType } }] : [];

		const result = await this.followModel
			.aggregate([
				{ $match: { followerId } },
				{ $sort: { createdAt: -1 } },
				{
					$facet: {
						list: [
							...typeMatch,
							{ $skip: (page - 1) * limit },
							{ $limit: limit },
							{
								$lookup: {
									from: 'members',
									localField: 'followingId',
									foreignField: '_id',
									pipeline: [{ $project: PUBLIC_MEMBER_FIELDS }],
									as: 'followingMember',
								},
							},
							{ $unwind: { path: '$followingMember', preserveNullAndEmptyArrays: true } },
							{
								$lookup: {
									from: 'clinics',
									localField: 'followingId',
									foreignField: 'memberId',
									pipeline: [{ $match: { clinicStatus: ClinicStatus.ACTIVE } }],
									as: 'followingClinic',
								},
							},
							{ $unwind: { path: '$followingClinic', preserveNullAndEmptyArrays: true } },
							{
								$lookup: {
									from: 'doctors',
									localField: 'followingId',
									foreignField: 'memberId',
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
									as: 'followingDoctor',
								},
							},
							{ $unwind: { path: '$followingDoctor', preserveNullAndEmptyArrays: true } },
						],
						metaCounter: [...typeMatch, { $count: 'total' }],
						typeCounts: [
							{ $group: { _id: '$followingType', total: { $sum: 1 } } },
							{ $project: { _id: 0, followingType: '$_id', total: 1 } },
						],
					},
				},
			])
			.exec();

		const data = result[0];
		data.list = data.list.map((follow: T) => ({
			...follow,
			followingMember: follow.followingMember
				? this.toPublicMember(follow.followingMember)
				: undefined,
		}));
		return data as Followings;
	}

	/** "Feride K. started following you." Only a follow that was created reaches here. */
	private async notifyFollowed(followerId: ObjectId, followingId: unknown): Promise<void> {
		const follower = await this.memberModel
			.findById(followerId, { memberFullName: 1, memberType: 1 })
			.lean()
			.exec();
		await this.notificationService.notify({
			type: NotificationType.NEW_FOLLOWER,
			receiverId: followingId,
			refId: followerId,
			authorId: followerId,
			params: { followerName: follower ? this.toPublicMember(follower).memberDisplayName : '' },
		});
	}

	private toPublicMember(member: T) {
		return {
			_id: member._id,
			memberType: member.memberType,
			memberDisplayName: toDisplayName(
				member.memberFullName,
				member.memberType === MemberType.USER,
			),
			memberImage: member.memberImage ?? '',
		};
	}
}
