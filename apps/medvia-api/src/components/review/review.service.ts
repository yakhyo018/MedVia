import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model, ObjectId, PipelineStage, Types } from 'mongoose';
import { Review, Reviews } from '../../libs/dto/review/review';
import {
	AdminReviewsInquiry,
	ReviewCreateInput,
	ReviewModerationInput,
	ReviewReplyInput,
	ReviewsInquiry,
	ReviewUpdate,
} from '../../libs/dto/review/review.input';
import { OrdinaryInquiry } from '../../libs/dto/common/inquiry';
import { AuditAction, AuditGroup, ReviewDecision } from '../../libs/enums/admin.enum';
import { Messages } from '../../libs/enums/common.enum';
import { MemberType } from '../../libs/enums/member.enum';
import { ReplierType, ReviewStatus } from '../../libs/enums/review.enum';
import { AuthMember, T } from '../../libs/types/common';
import { shapeIntoMongoObjectId, toDisplayName } from '../../libs/config';
import { BookingService } from '../booking/booking.service';
import { ClinicService } from '../clinic/clinic.service';
import { DoctorService } from '../doctor/doctor.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { checkCanReview, EDITABLE, movesRating, planModeration, summarize } from './review.rules';

const AUDIT_ACTION: Record<ReviewDecision, AuditAction> = {
	[ReviewDecision.APPROVE]: AuditAction.REVIEW_APPROVE,
	[ReviewDecision.REQUEST_CHANGES]: AuditAction.REVIEW_REQUEST_CHANGES,
	[ReviewDecision.REJECT]: AuditAction.REVIEW_HIDE,
};

/** Names on a review card. One lookup each; the patient's name is shortened afterwards. */
const lookupNames: PipelineStage.FacetPipelineStage[] = [
	{
		$lookup: {
			from: 'members',
			localField: 'memberId',
			foreignField: '_id',
			pipeline: [{ $project: { memberFullName: 1 } }],
			as: 'm',
		},
	},
	{
		$lookup: {
			from: 'clinics',
			localField: 'clinicId',
			foreignField: '_id',
			pipeline: [{ $project: { clinicName: 1 } }],
			as: 'c',
		},
	},
	{
		$lookup: {
			from: 'doctors',
			localField: 'doctorId',
			foreignField: '_id',
			pipeline: [{ $project: { doctorName: 1 } }],
			as: 'd',
		},
	},
	{
		$lookup: {
			from: 'treatments',
			localField: 'treatmentId',
			foreignField: '_id',
			pipeline: [{ $project: { treatmentName: 1 } }],
			as: 't',
		},
	},
	{
		$lookup: {
			from: 'bookings',
			localField: 'bookingId',
			foreignField: '_id',
			pipeline: [{ $project: { bookingDate: 1 } }],
			as: 'b',
		},
	},
	{
		$addFields: {
			patientName: { $first: '$m.memberFullName' },
			clinicName: { $first: '$c.clinicName' },
			doctorName: { $first: '$d.doctorName' },
			treatmentName: { $first: '$t.treatmentName' },
			visitDate: { $first: '$b.bookingDate' },
		},
	},
	{ $project: { m: 0, c: 0, d: 0, t: 0, b: 0 } },
];

@Injectable()
export class ReviewService {
	constructor(
		@InjectModel('Review') private readonly reviewModel: Model<T>,
		@InjectModel('Doctor') private readonly doctorModel: Model<T>,
		@InjectConnection() private readonly connection: Connection,
		private readonly bookingService: BookingService,
		private readonly clinicService: ClinicService,
		private readonly doctorService: DoctorService,
		private readonly auditLogService: AuditLogService,
	) {}

	/* ───────────────────────── patient ───────────────────────── */

	/**
	 * The booking is flagged and the review written in one transaction. Two clicks on
	 * "Publish": the second finds the flag set (markReviewed is conditional), and the unique
	 * bookingId index would refuse it anyway. Waits for the admin — no rating change yet.
	 */
	public async createReview(memberId: ObjectId, input: ReviewCreateInput): Promise<Review> {
		const booking = await this.bookingService.findOwnBooking(memberId, input.bookingId);
		const now = new Date();
		checkCanReview(booking, now);

		const { bookingId: _id, ownVisitConfirmed: _ok, ...fields } = input;
		let created!: T;
		const session = await this.connection.startSession();
		try {
			await session.withTransaction(async () => {
				await this.bookingService.markReviewed(booking._id, session);
				const [doc] = await this.reviewModel.create(
					[
						{
							...fields,
							reviewStatus: ReviewStatus.PENDING,
							submittedAt: now,
							bookingId: booking._id,
							memberId,
							clinicId: booking.clinicId,
							doctorId: booking.doctorId,
							treatmentId: booking.treatmentId,
						},
					],
					{ session },
				);
				created = doc.toObject();
			});
		} finally {
			await session.endSession();
		}
		return created as Review;
	}

	/**
	 * Any edit goes back to the admin. A published review leaves the page until it is approved
	 * again (no draft/live split as for treatments: a review has no bookings to lose while it
	 * waits). The admin's note and flags are cleared — the patient answered them.
	 */
	public async updateReview(memberId: ObjectId, input: ReviewUpdate): Promise<Review> {
		const current = await this.findOwnReview(memberId, input.reviewId);
		if (!EDITABLE.includes(current.reviewStatus)) {
			throw new BadRequestException(Messages.WRONG_STATUS);
		}

		const { reviewId: _id, ...fields } = input;
		const set: T = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined));
		const review = await this.reviewModel
			.findOneAndUpdate(
				{ _id: current._id, reviewStatus: current.reviewStatus },
				{
					$set: {
						...set,
						reviewStatus: ReviewStatus.PENDING,
						submittedAt: new Date(),
						reviewFlags: [],
					},
					$unset: { reviewNote: 1 },
				},
				{ new: true, runValidators: true },
			)
			.lean()
			.exec();
		if (!review) throw new BadRequestException(Messages.WRONG_STATUS);

		if (movesRating(current.reviewStatus, ReviewStatus.PENDING)) await this.refreshRatings(review);
		return this.present(review);
	}

	/** Soft delete, final: the booking stays flagged, so no second review replaces this one. */
	public async removeReview(memberId: ObjectId, reviewId: string): Promise<Review> {
		const current = await this.findOwnReview(memberId, reviewId);
		const review = await this.reviewModel
			.findOneAndUpdate(
				{ _id: current._id, reviewStatus: current.reviewStatus },
				{ $set: { reviewStatus: ReviewStatus.DELETE, deletedAt: new Date() } },
				{ new: true },
			)
			.lean()
			.exec();
		if (!review) throw new BadRequestException(Messages.WRONG_STATUS);

		if (movesRating(current.reviewStatus, ReviewStatus.DELETE)) await this.refreshRatings(review);
		return this.present(review);
	}

	/** "My Reviews": every status but deleted, with the admin's note when there is one. */
	public async getMyReviews(memberId: ObjectId, input: OrdinaryInquiry): Promise<Reviews> {
		const [result] = await this.reviewModel
			.aggregate([
				{ $match: { memberId, reviewStatus: { $ne: ReviewStatus.DELETE } } },
				{ $sort: { createdAt: -1 } },
				{
					$facet: {
						list: [
							{ $skip: (input.page - 1) * input.limit },
							{ $limit: input.limit },
							...lookupNames,
						],
						metaCounter: [{ $count: 'total' }],
					},
				},
			])
			.exec();
		return { list: result.list.map((r: T) => this.present(r)), metaCounter: result.metaCounter };
	}

	/* ───────────────────────── clinic and doctor ───────────────────────── */

	/**
	 * One public reply per review, by the clinic of the visit or its doctor; writing again
	 * replaces it. Only published reviews — a reply to a review nobody can see is pointless.
	 */
	public async replyToReview(authMember: AuthMember, input: ReviewReplyInput): Promise<Review> {
		const filter: T = { _id: this.toObjectId(input.reviewId), reviewStatus: ReviewStatus.ACTIVE };
		let replierType: ReplierType;
		if (authMember.memberType === MemberType.AGENT) {
			const clinic = await this.clinicService.findClinicByMember(authMember._id);
			if (!clinic) throw new NotFoundException(Messages.NO_DATA_FOUND);
			filter.clinicId = clinic._id;
			replierType = ReplierType.CLINIC;
		} else {
			const doctor = await this.doctorModel
				.findOne({ memberId: authMember._id }, { _id: 1 })
				.lean()
				.exec();
			if (!doctor) throw new NotFoundException(Messages.NO_DATA_FOUND);
			filter.doctorId = doctor._id;
			replierType = ReplierType.DOCTOR;
		}

		const review = await this.reviewModel
			.findOneAndUpdate(
				filter,
				{
					$set: {
						reviewReply: {
							replyContent: input.replyContent,
							replyLang: input.replyLang,
							replierId: authMember._id,
							replierType,
							repliedAt: new Date(),
						},
					},
				},
				{ new: true },
			)
			.lean()
			.exec();
		if (!review) throw new NotFoundException(Messages.NO_DATA_FOUND);
		return this.present(review, true);
	}

	/* ───────────────────────── public ───────────────────────── */

	/**
	 * Published reviews of a clinic, a doctor or a treatment, newest first, with the rating
	 * summary of all of them. "Needs reply" narrows the list, not the summary: the bars on the
	 * dashboard show every review. The admin's note and flags never leave here.
	 */
	public async getReviews(input: ReviewsInquiry): Promise<Reviews> {
		const match: T = { reviewStatus: ReviewStatus.ACTIVE };
		if (input.clinicId) match.clinicId = this.toObjectId(input.clinicId);
		if (input.doctorId) match.doctorId = this.toObjectId(input.doctorId);
		if (input.treatmentId) match.treatmentId = this.toObjectId(input.treatmentId);
		const narrow: T = input.needsReply ? { reviewReply: { $exists: false } } : {};

		const [result] = await this.reviewModel
			.aggregate([
				{ $match: match },
				{
					$facet: {
						list: [
							{ $match: narrow },
							{ $sort: { createdAt: -1, _id: -1 } },
							{ $skip: (input.page - 1) * input.limit },
							{ $limit: input.limit },
							{ $project: { reviewNote: 0, reviewFlags: 0 } },
							...lookupNames,
						],
						metaCounter: [{ $match: narrow }, { $count: 'total' }],
						ratings: [{ $group: { _id: '$reviewRating', count: { $sum: 1 } } }],
					},
				},
			])
			.exec();
		return {
			list: result.list.map((r: T) => this.present(r, true)),
			metaCounter: result.metaCounter,
			summary: summarize(result.ratings),
		};
	}

	/* ───────────────────────── admin ───────────────────────── */

	/** The moderation queue (PENDING, oldest first) or any other status, newest first. */
	public async getReviewsByAdmin(input: AdminReviewsInquiry): Promise<Reviews> {
		const reviewStatus = input.reviewStatus ?? ReviewStatus.PENDING;
		const sort: T =
			reviewStatus === ReviewStatus.PENDING
				? { submittedAt: 1, _id: 1 }
				: { createdAt: -1, _id: -1 };
		const [result] = await this.reviewModel
			.aggregate([
				{ $match: { reviewStatus } },
				{ $sort: sort },
				{
					$facet: {
						list: [
							{ $skip: (input.page - 1) * input.limit },
							{ $limit: input.limit },
							...lookupNames,
						],
						metaCounter: [{ $count: 'total' }],
					},
				},
			])
			.exec();
		return { list: result.list.map((r: T) => this.present(r)), metaCounter: result.metaCounter };
	}

	/**
	 * Approve, request edit, hide — table-driven (MODERATION). The write carries the version
	 * the admin read (submittedAt): if the patient edited the review meanwhile, the decision is
	 * refused instead of approving text the admin never saw (M4's optimistic check).
	 */
	public async moderateReview(adminId: ObjectId, input: ReviewModerationInput): Promise<Review> {
		const _id = this.toObjectId(input.reviewId);
		const current = await this.reviewModel.findById(_id).lean().exec();
		if (!current || current.reviewStatus === ReviewStatus.DELETE) {
			throw new NotFoundException(Messages.NO_DATA_FOUND);
		}

		const note = input.reviewNote?.trim();
		const to = planModeration(current.reviewStatus, input.decision, note);
		const update: T =
			input.decision === ReviewDecision.APPROVE
				? { $set: { reviewStatus: to, reviewFlags: [] }, $unset: { reviewNote: 1 } }
				: { $set: { reviewStatus: to, reviewNote: note, reviewFlags: input.reviewFlags ?? [] } };

		const review = await this.reviewModel
			.findOneAndUpdate(
				{ _id, reviewStatus: current.reviewStatus, submittedAt: current.submittedAt },
				update,
				{ new: true },
			)
			.lean()
			.exec();
		if (!review) throw new BadRequestException(Messages.REVIEW_CHANGED);

		await this.auditLogService.record({
			auditAction: AUDIT_ACTION[input.decision],
			auditGroup: AuditGroup.REVIEW,
			auditRefId: _id,
			auditNote: note,
			memberId: adminId,
		});
		if (movesRating(current.reviewStatus, to)) await this.refreshRatings(review);
		return this.present(review);
	}

	/* ───────────────────────── helpers ───────────────────────── */

	/**
	 * clinicRating / clinicReviews and doctorRating / doctorReviews, recomputed from the ACTIVE
	 * reviews and written whole — the clinicMinPrice pattern. Idempotent: a lost refresh heals
	 * on the next review change, and M9 can rebuild every clinic.
	 */
	private async refreshRatings(review: T): Promise<void> {
		const [clinic, doctor] = await Promise.all([
			this.ratingOf({ clinicId: review.clinicId }),
			this.ratingOf({ doctorId: review.doctorId }),
		]);
		await this.clinicService.setReviewSummary(review.clinicId, clinic.rating, clinic.reviews);
		await this.doctorService.setReviewSummary(review.doctorId, doctor.rating, doctor.reviews);
	}

	private async ratingOf(match: T) {
		const groups = await this.reviewModel
			.aggregate([
				{ $match: { ...match, reviewStatus: ReviewStatus.ACTIVE } },
				{ $group: { _id: '$reviewRating', count: { $sum: 1 } } },
			])
			.exec();
		return summarize(groups);
	}

	private async findOwnReview(memberId: ObjectId, reviewId: string): Promise<T> {
		const review = await this.reviewModel
			.findOne({
				_id: this.toObjectId(reviewId),
				memberId,
				reviewStatus: { $ne: ReviewStatus.DELETE },
			})
			.lean()
			.exec();
		if (!review) throw new NotFoundException(Messages.NO_DATA_FOUND);
		return review;
	}

	/** Patients appear as "Feride K."; public cards never carry the admin's note or flags. */
	private present(review: T, isPublic = false): Review {
		const result: T = { ...review };
		if (result.patientName !== undefined)
			result.patientName = toDisplayName(result.patientName ?? '', true);
		if (isPublic) {
			delete result.reviewNote;
			delete result.reviewFlags;
		}
		return result as Review;
	}

	private toObjectId(id: string): ObjectId {
		if (!Types.ObjectId.isValid(id)) throw new NotFoundException(Messages.NO_DATA_FOUND);
		return shapeIntoMongoObjectId(id) as ObjectId;
	}
}
