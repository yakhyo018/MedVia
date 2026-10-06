import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model, ObjectId, PipelineStage, Types } from 'mongoose';
import { createHash } from 'crypto';
import type { Request, Response } from 'express';
import { Clinic, Clinics } from '../../libs/dto/clinic/clinic';
import {
	AdminClinicsInquiry,
	ClinicHourInput,
	ClinicReviewInput,
	ClinicSignupInput,
	ClinicsInquiry,
	ClinicStatusInput,
} from '../../libs/dto/clinic/clinic.input';
import { ClinicUpdate } from '../../libs/dto/clinic/clinic.update';
import { OrdinaryInquiry } from '../../libs/dto/common/inquiry';
import { Member } from '../../libs/dto/member/member';
import { AuditAction, AuditGroup } from '../../libs/enums/admin.enum';
import { ClinicDecision, ClinicStatus } from '../../libs/enums/clinic.enum';
import { Direction, Language, Messages } from '../../libs/enums/common.enum';
import { LikeGroup } from '../../libs/enums/like.enum';
import { MemberType } from '../../libs/enums/member.enum';
import { ViewGroup } from '../../libs/enums/view.enum';
import { AuthMember, StatisticModifier, T } from '../../libs/types/common';
import { CacheKeys, escapeRegex, shapeIntoMongoObjectId } from '../../libs/config';
import { CacheService } from '../../redis/cache.service';
import { AuthService } from '../auth/auth.service';
import { MemberService } from '../member/member.service';
import { LikeService } from '../like/like.service';
import { ViewService } from '../view/view.service';
import { FollowService } from '../follow/follow.service';
import { AuditLogService } from '../audit-log/audit-log.service';

/** Short: the list carries counters, and a stale count is visible. */
const LIST_TTL_SECONDS = 60;
const DETAIL_TTL_SECONDS = 60;

/** "Similar clinics nearby": within 5 km of the pin. */
const NEARBY_MAX_METERS = 5_000;

/** Identity fields the admin verified. Locked once the clinic is live. */
const LOCKED_FIELDS = ['clinicName', 'clinicNameKo', 'clinicDistrict', 'clinicAddress'] as const;

@Injectable()
export class ClinicService {
	constructor(
		@InjectModel('Clinic') private readonly clinicModel: Model<Clinic>,
		@InjectConnection() private readonly connection: Connection,
		private readonly authService: AuthService,
		private readonly memberService: MemberService,
		private readonly likeService: LikeService,
		private readonly viewService: ViewService,
		private readonly followService: FollowService,
		private readonly auditLogService: AuditLogService,
		private readonly cacheService: CacheService,
	) {}

	/* ───────────────────────── clinic account ───────────────────────── */

	/**
	 * The AGENT account and its clinic in one transaction. Without it, a crash (or a
	 * validation error) between the two inserts leaves an AGENT account with no clinic:
	 * it can log in, owns nothing, and its email can never sign up again.
	 *
	 * withTransaction retries the callback on transient errors (a primary election, a
	 * write conflict), so the callback must be safe to run twice — it only inserts.
	 * The session cookie is set after the commit: never for an account that was rolled back.
	 */
	public async signupClinic(
		input: ClinicSignupInput,
		req: Request,
		res: Response,
	): Promise<Member> {
		const {
			memberEmail,
			memberPassword,
			memberFullName,
			termsAccepted,
			authorizedConfirmed,
			...clinic
		} = input;

		const session = await this.connection.startSession();
		let member!: T;
		try {
			await session.withTransaction(async () => {
				member = await this.memberService.createEmailMember(
					{
						memberType: MemberType.AGENT,
						memberEmail,
						memberPassword,
						memberFullName,
						memberLang: Language.KO,
					},
					session,
				);
				await this.clinicModel.create(
					[{ ...clinic, memberId: member._id, submittedAt: new Date() }],
					{
						session,
					},
				);
			});
		} finally {
			await session.endSession();
		}

		return await this.authService.startSession(member, req, res);
	}

	public async getMyClinic(memberId: ObjectId): Promise<Clinic> {
		const clinic = await this.clinicModel.findOne({ memberId }).lean().exec();
		if (!clinic) throw new NotFoundException(Messages.NO_DATA_FOUND);
		return clinic as Clinic;
	}

	/**
	 * The write is conditional on the status that was read. If an admin approves the clinic
	 * between our read and our write, the filter no longer matches and nothing is written —
	 * otherwise a PENDING-time edit of a locked field could land on a just-verified clinic.
	 */
	public async updateMyClinic(memberId: ObjectId, input: ClinicUpdate): Promise<Clinic> {
		const clinic = await this.clinicModel.findOne({ memberId }).lean().exec();
		if (!clinic) throw new NotFoundException(Messages.NO_DATA_FOUND);
		if ([ClinicStatus.REJECTED, ClinicStatus.DELETE].includes(clinic.clinicStatus)) {
			throw new BadRequestException(Messages.WRONG_STATUS);
		}

		const verified = [ClinicStatus.ACTIVE, ClinicStatus.SUSPENDED].includes(clinic.clinicStatus);
		if (verified) this.assertLockedFieldsUnchanged(clinic, input);

		const { clinicLocation, clinicHours, ...fields } = input;
		const update: T = { ...fields };
		if (clinicLocation) {
			update.clinicLocation = {
				type: 'Point',
				coordinates: [clinicLocation.lng, clinicLocation.lat],
			};
		}
		if (clinicHours) update.clinicHours = this.normalizeHours(clinicHours);

		const updated = await this.clinicModel
			.findOneAndUpdate(
				{ _id: clinic._id, clinicStatus: clinic.clinicStatus },
				{ $set: update },
				{ new: true, runValidators: true },
			)
			.lean()
			.exec();
		if (!updated) throw new BadRequestException(Messages.WRONG_STATUS);

		await this.invalidateClinic(clinic._id);
		return updated as Clinic;
	}

	/** After "request changes": the clinic fixed its details and sends them back. */
	public async resubmitClinic(memberId: ObjectId): Promise<Clinic> {
		const clinic = await this.clinicModel
			.findOneAndUpdate(
				{ memberId, clinicStatus: ClinicStatus.CHANGES_REQUESTED },
				{ $set: { clinicStatus: ClinicStatus.PENDING, submittedAt: new Date() } },
				{ new: true },
			)
			.lean()
			.exec();
		if (!clinic) throw new BadRequestException(Messages.WRONG_STATUS);
		return clinic as Clinic;
	}

	/* ───────────────────────── public ───────────────────────── */

	/**
	 * The cached part is the same for everyone. meLiked / meFollowed differ per viewer,
	 * so they are added after the cache — caching them would show one patient's heart
	 * to the next visitor.
	 */
	public async getClinic(authMember: AuthMember | null, clinicId: string): Promise<Clinic> {
		const _id = this.toObjectId(clinicId);
		const clinic = await this.cacheService.wrap<T | null>(
			CacheKeys.clinicDetail(_id),
			DETAIL_TTL_SECONDS,
			() => this.clinicModel.findOne({ _id, clinicStatus: ClinicStatus.ACTIVE }).lean().exec(),
		);
		if (!clinic) throw new NotFoundException(Messages.NO_DATA_FOUND);
		if (!authMember) return clinic as Clinic;

		// Only patients build "Recently Visited"; a clinic checking its own page is not a view.
		if (authMember.memberType === MemberType.USER) {
			const firstVisit = await this.viewService.recordView({
				memberId: authMember._id,
				viewGroup: ViewGroup.CLINIC,
				viewRefId: _id,
			});
			if (firstVisit) await this.clinicStatsEditor({ _id, targetKey: 'clinicViews', modifier: 1 });
		}

		const [meLiked, meFollowed] = await Promise.all([
			this.likeService.isLiked(authMember._id, _id),
			this.followService.isFollowing(authMember._id, clinic.memberId),
		]);
		return { ...clinic, meLiked, meFollowed } as Clinic;
	}

	/**
	 * Cached per distinct filter set. The key is a hash of the input, so the same filters
	 * hit the same entry; any change to any clinic drops every list entry (invalidateClinic).
	 */
	public async getClinics(input: ClinicsInquiry): Promise<Clinics> {
		const hash = createHash('sha1').update(JSON.stringify(input)).digest('hex');
		return await this.cacheService.wrap(CacheKeys.clinicList(hash), LIST_TTL_SECONDS, () =>
			this.loadClinics(input),
		);
	}

	private async loadClinics(input: ClinicsInquiry): Promise<Clinics> {
		const { page, limit, sort, direction = Direction.DESC, search = {} } = input;
		const pipeline: PipelineStage[] = [];
		const text = search.text?.trim();
		const useSearch = !!text && !!process.env.ATLAS_SEARCH_INDEX;

		// Atlas Search: relevance-ranked, typo-tolerant, Korean-aware. $search must be the
		// first stage. Without the index configured, an escaped regex does the matching.
		if (useSearch) {
			pipeline.push({
				$search: {
					index: process.env.ATLAS_SEARCH_INDEX,
					compound: {
						should: [
							{
								text: {
									query: text,
									path: 'clinicName',
									fuzzy: { maxEdits: 1 },
									score: { boost: { value: 3 } },
								},
							},
							{ text: { query: text, path: 'clinicNameKo', score: { boost: { value: 3 } } } },
							{ text: { query: text, path: 'clinicDesc', fuzzy: { maxEdits: 1 } } },
						],
						minimumShouldMatch: 1,
					},
				},
			});
		}

		const match: T = { clinicStatus: ClinicStatus.ACTIVE };
		if (text && !useSearch) {
			const pattern = new RegExp(escapeRegex(text), 'i');
			match.$or = [{ clinicName: pattern }, { clinicNameKo: pattern }];
		}
		if (search.specialty) match.clinicSpecialty = search.specialty;
		if (search.districts?.length) match.clinicDistrict = { $in: search.districts };
		if (search.langs?.length) match.clinicLangs = { $in: search.langs };
		if (search.interpreter) {
			match.clinicInterpreterLangs = search.langs?.length ? { $in: search.langs } : { $ne: [] };
		}
		pipeline.push({ $match: match });

		// $search already returns the best match first; an explicit sort replaces relevance.
		if (!useSearch || sort)
			pipeline.push({ $sort: { [sort ?? 'createdAt']: direction, _id: direction } });

		pipeline.push({
			$facet: {
				list: [{ $skip: (page - 1) * limit }, { $limit: limit }],
				metaCounter: [{ $count: 'total' }],
			},
		});

		const result = await this.clinicModel.aggregate(pipeline).exec();
		return result[0] as Clinics;
	}

	/**
	 * Same specialty, nearest first, when the clinic has a map pin; otherwise the most
	 * liked clinics of the same specialty in the same district.
	 */
	public async getNearbyClinics(clinicId: string, limit: number): Promise<Clinic[]> {
		const _id = this.toObjectId(clinicId);
		const base = await this.clinicModel
			.findOne({ _id, clinicStatus: ClinicStatus.ACTIVE })
			.lean()
			.exec();
		if (!base) throw new NotFoundException(Messages.NO_DATA_FOUND);

		const query: T = {
			clinicStatus: ClinicStatus.ACTIVE,
			clinicSpecialty: base.clinicSpecialty,
			_id: { $ne: _id },
		};

		if (base.clinicLocation?.coordinates?.length) {
			// $geoNear must be the first stage and uses the 2dsphere index.
			return await this.clinicModel
				.aggregate([
					{
						$geoNear: {
							near: base.clinicLocation as PipelineStage.GeoNear['$geoNear']['near'],
							distanceField: 'distance',
							maxDistance: NEARBY_MAX_METERS,
							query,
							spherical: true,
						},
					},
					{ $limit: limit },
				])
				.exec();
		}

		return (await this.clinicModel
			.find({ ...query, clinicDistrict: base.clinicDistrict })
			.sort({ clinicLikes: -1, _id: 1 })
			.limit(limit)
			.lean()
			.exec()) as Clinic[];
	}

	/* ───────────────────────── patient activity ───────────────────────── */

	public async likeTargetClinic(memberId: ObjectId, clinicId: string): Promise<Clinic> {
		const _id = this.toObjectId(clinicId);
		const exists = await this.clinicModel.exists({ _id, clinicStatus: ClinicStatus.ACTIVE }).exec();
		if (!exists) throw new NotFoundException(Messages.NO_DATA_FOUND);

		const modifier = await this.likeService.toggleLike({
			memberId,
			likeGroup: LikeGroup.CLINIC,
			likeRefId: _id,
		});

		const clinic =
			modifier !== 0
				? await this.clinicStatsEditor({ _id, targetKey: 'clinicLikes', modifier })
				: await this.clinicModel.findById(_id).lean().exec();

		// The page shows the count next to the heart; a stale cached count would contradict it.
		await this.cacheService.del(CacheKeys.clinicDetail(_id));
		return { ...clinic, meLiked: modifier >= 0 } as Clinic;
	}

	public async getFavoriteClinics(memberId: ObjectId, input: OrdinaryInquiry): Promise<Clinics> {
		return await this.likeService.getFavoriteClinics(memberId, input);
	}

	public async getVisitedClinics(memberId: ObjectId, input: OrdinaryInquiry): Promise<Clinics> {
		return await this.viewService.getVisitedClinics(memberId, input);
	}

	/** Counters move only through $inc: atomic, so two concurrent likes both count. */
	public async clinicStatsEditor(input: StatisticModifier): Promise<T | null> {
		const { _id, targetKey, modifier } = input;
		return await this.clinicModel
			.findByIdAndUpdate(_id, { $inc: { [targetKey]: modifier } }, { new: true })
			.lean()
			.exec();
	}

	/* ───────────────────────── admin ───────────────────────── */

	public async getClinicsByAdmin(input: AdminClinicsInquiry): Promise<Clinics> {
		const { page, limit, clinicStatus, text } = input;

		const match: T = {};
		if (clinicStatus) match.clinicStatus = clinicStatus;
		if (text) {
			const pattern = new RegExp(escapeRegex(text.trim()), 'i');
			match.$or = [{ clinicName: pattern }, { clinicNameKo: pattern }];
		}

		// The verification queue is first-come, first-served; every other view is newest first.
		const order: Record<string, 1 | -1> =
			clinicStatus === ClinicStatus.PENDING
				? { submittedAt: 1, _id: 1 }
				: { createdAt: -1, _id: -1 };

		const result = await this.clinicModel
			.aggregate([
				{ $match: match },
				{ $sort: order },
				{
					$facet: {
						list: [
							{ $skip: (page - 1) * limit },
							{ $limit: limit },
							{
								$lookup: {
									from: 'members',
									localField: 'memberId',
									foreignField: '_id',
									pipeline: [{ $project: { memberPassword: 0 } }],
									as: 'memberData',
								},
							},
							{ $unwind: { path: '$memberData', preserveNullAndEmptyArrays: true } },
						],
						metaCounter: [{ $count: 'total' }],
					},
				},
			])
			.exec();

		return result[0] as Clinics;
	}

	/**
	 * The status in the filter is the state machine: only a PENDING clinic can be decided,
	 * and two admins clicking at once cannot both succeed — the second finds no PENDING row.
	 * Approval also demands a photo and a language in the same filter, so the check and the
	 * write are one atomic step.
	 */
	public async reviewClinic(adminId: ObjectId, input: ClinicReviewInput): Promise<Clinic> {
		const _id = this.toObjectId(input.clinicId);
		const note = input.clinicReviewNote?.trim();
		if (input.decision !== ClinicDecision.APPROVE && !note) {
			throw new BadRequestException(Messages.REVIEW_NOTE_REQUIRED);
		}

		const filter: T = { _id, clinicStatus: ClinicStatus.PENDING };
		let update: T;
		let auditAction: AuditAction;

		switch (input.decision) {
			case ClinicDecision.APPROVE:
				filter['clinicImages.0'] = { $exists: true };
				filter['clinicLangs.0'] = { $exists: true };
				update = {
					$set: { clinicStatus: ClinicStatus.ACTIVE, verifiedAt: new Date() },
					$unset: { clinicReviewNote: 1 },
				};
				auditAction = AuditAction.CLINIC_APPROVE;
				break;
			case ClinicDecision.REQUEST_CHANGES:
				update = { $set: { clinicStatus: ClinicStatus.CHANGES_REQUESTED, clinicReviewNote: note } };
				auditAction = AuditAction.CLINIC_REQUEST_CHANGES;
				break;
			case ClinicDecision.REJECT:
				update = { $set: { clinicStatus: ClinicStatus.REJECTED, clinicReviewNote: note } };
				auditAction = AuditAction.CLINIC_REJECT;
				break;
		}

		const clinic = await this.clinicModel
			.findOneAndUpdate(filter, update, { new: true })
			.lean()
			.exec();
		if (!clinic) await this.explainRefusal(_id, ClinicStatus.PENDING, Messages.CLINIC_NOT_READY);

		await this.auditLogService.record({
			auditAction,
			auditGroup: AuditGroup.CLINIC,
			auditRefId: _id,
			auditNote: note,
			memberId: adminId,
		});
		await this.invalidateClinic(_id);
		return clinic as Clinic;
	}

	public async suspendClinic(adminId: ObjectId, input: ClinicStatusInput): Promise<Clinic> {
		return await this.moveStatus(
			adminId,
			input,
			ClinicStatus.ACTIVE,
			ClinicStatus.SUSPENDED,
			AuditAction.CLINIC_SUSPEND,
		);
	}

	public async restoreClinic(adminId: ObjectId, input: ClinicStatusInput): Promise<Clinic> {
		return await this.moveStatus(
			adminId,
			input,
			ClinicStatus.SUSPENDED,
			ClinicStatus.ACTIVE,
			AuditAction.CLINIC_RESTORE,
		);
	}

	private async moveStatus(
		adminId: ObjectId,
		input: ClinicStatusInput,
		from: ClinicStatus,
		to: ClinicStatus,
		auditAction: AuditAction,
	): Promise<Clinic> {
		const _id = this.toObjectId(input.clinicId);
		const clinic = await this.clinicModel
			.findOneAndUpdate({ _id, clinicStatus: from }, { $set: { clinicStatus: to } }, { new: true })
			.lean()
			.exec();
		if (!clinic) await this.explainRefusal(_id, from, Messages.WRONG_STATUS);

		await this.auditLogService.record({
			auditAction,
			auditGroup: AuditGroup.CLINIC,
			auditRefId: _id,
			auditNote: input.note?.trim(),
			memberId: adminId,
		});
		await this.invalidateClinic(_id);
		return clinic as Clinic;
	}

	/* ───────────────────────── helpers ───────────────────────── */

	/** A conditional update matched nothing: say whether the clinic is missing, in the wrong state, or incomplete. */
	private async explainRefusal(
		_id: ObjectId,
		expected: ClinicStatus,
		otherwise: Messages,
	): Promise<never> {
		const current = await this.clinicModel.findById(_id, { clinicStatus: 1 }).lean().exec();
		if (!current) throw new NotFoundException(Messages.NO_DATA_FOUND);
		if (current.clinicStatus !== expected) throw new BadRequestException(Messages.WRONG_STATUS);
		throw new BadRequestException(otherwise);
	}

	/** A value equal to the stored one is allowed: the profile form sends every field back. */
	private assertLockedFieldsUnchanged(clinic: T, input: ClinicUpdate): void {
		const changed = LOCKED_FIELDS.some(
			(key) => input[key] !== undefined && input[key] !== clinic[key],
		);
		const [lng, lat] = clinic.clinicLocation?.coordinates ?? [];
		const pinMoved =
			!!input.clinicLocation &&
			lng !== undefined &&
			(input.clinicLocation.lng !== lng || input.clinicLocation.lat !== lat);
		if (changed || pinMoved) throw new BadRequestException(Messages.CLINIC_FIELDS_LOCKED);
	}

	/** One row per weekday; an open day needs both times and opens before it closes. */
	private normalizeHours(hours: ClinicHourInput[]): T[] {
		const days = new Set(hours.map((h) => h.day));
		if (days.size !== hours.length) throw new BadRequestException(Messages.INVALID_HOURS);

		return hours
			.map((h) => {
				if (h.closed) return { day: h.day, closed: true };
				// "HH:mm" strings compare correctly as text.
				if (!h.open || !h.close || h.open >= h.close)
					throw new BadRequestException(Messages.INVALID_HOURS);
				return { day: h.day, open: h.open, close: h.close, closed: false };
			})
			.sort((a, b) => a.day - b.day);
	}

	/** An id that is not an ObjectId cannot exist — answered before it reaches the cache or Mongo. */
	private toObjectId(id: string): ObjectId {
		if (!Types.ObjectId.isValid(id)) throw new NotFoundException(Messages.NO_DATA_FOUND);
		return shapeIntoMongoObjectId(id) as ObjectId;
	}

	private async invalidateClinic(clinicId: unknown): Promise<void> {
		await this.cacheService.del(CacheKeys.clinicDetail(clinicId));
		await this.cacheService.invalidate(CacheKeys.clinicListPattern);
	}
}
