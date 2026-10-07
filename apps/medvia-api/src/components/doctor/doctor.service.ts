import { BadRequestException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model, ObjectId, PipelineStage, Types } from 'mongoose';
import { createHash } from 'crypto';
import { Doctor, Doctors } from '../../libs/dto/doctor/doctor';
import {
	AdminDoctorsInquiry,
	DoctorClinicUpdate,
	DoctorCreateInput,
	DoctorPasswordReset,
	DoctorProfileUpdate,
	DoctorsInquiry,
	DoctorStatusInput,
} from '../../libs/dto/doctor/doctor.input';
import { OrdinaryInquiry } from '../../libs/dto/common/inquiry';
import { AuditAction, AuditGroup } from '../../libs/enums/admin.enum';
import { ClinicStatus } from '../../libs/enums/clinic.enum';
import { Direction, Language, Messages } from '../../libs/enums/common.enum';
import { DoctorStatus } from '../../libs/enums/doctor.enum';
import { LikeGroup } from '../../libs/enums/like.enum';
import { MemberType } from '../../libs/enums/member.enum';
import { ViewGroup } from '../../libs/enums/view.enum';
import { AuthMember, StatisticModifier, T } from '../../libs/types/common';
import { CacheKeys, escapeRegex, shapeIntoMongoObjectId } from '../../libs/config';
import { CacheService } from '../../redis/cache.service';
import { MemberService } from '../member/member.service';
import { ClinicService } from '../clinic/clinic.service';
import { LikeService } from '../like/like.service';
import { ViewService } from '../view/view.service';
import { FollowService } from '../follow/follow.service';
import { AuditLogService } from '../audit-log/audit-log.service';

const LIST_TTL_SECONDS = 60;
const DETAIL_TTL_SECONDS = 60;

/** A clinic in these states cannot add doctors. Before approval it can: the admin sees them. */
const CLOSED_CLINIC = [ClinicStatus.REJECTED, ClinicStatus.DELETE];

/** The clinic card shown next to a doctor. */
const lookupClinic = (onlyActive: boolean): PipelineStage.FacetPipelineStage[] => [
	{
		$lookup: {
			from: 'clinics',
			localField: 'clinicId',
			foreignField: '_id',
			pipeline: onlyActive ? [{ $match: { clinicStatus: ClinicStatus.ACTIVE } }] : [],
			as: 'clinicData',
		},
	},
	{ $unwind: { path: '$clinicData', preserveNullAndEmptyArrays: !onlyActive } },
];

/** The DOCTOR account (login email) for the clinic's table and the admin list. */
const lookupMember: PipelineStage.FacetPipelineStage[] = [
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
];

@Injectable()
export class DoctorService implements OnModuleInit {
	constructor(
		@InjectModel('Doctor') private readonly doctorModel: Model<Doctor>,
		@InjectConnection() private readonly connection: Connection,
		private readonly memberService: MemberService,
		private readonly clinicService: ClinicService,
		private readonly likeService: LikeService,
		private readonly viewService: ViewService,
		private readonly followService: FollowService,
		private readonly auditLogService: AuditLogService,
		private readonly cacheService: CacheService,
	) {}

	/** The doctor's answer to likeTarget(DOCTOR): visible doctors only, counter in doctorLikes. */
	public onModuleInit(): void {
		this.likeService.registerTarget(LikeGroup.DOCTOR, {
			isLikeable: async (_id) => !!(await this.findVisibleDoctor(_id)),
			moveLikes: async (_id, modifier) => {
				const doctor = await this.doctorStatsEditor({ _id, targetKey: 'doctorLikes', modifier });
				await this.cacheService.del(CacheKeys.doctorDetail(_id));
				return doctor?.doctorLikes ?? 0;
			},
			countLikes: async (_id) =>
				(await this.doctorModel.findById(_id, { doctorLikes: 1 }).lean().exec())?.doctorLikes ?? 0,
		});
	}

	/* ───────────────────────── clinic account ───────────────────────── */

	/**
	 * The DOCTOR account and the doctor page in one transaction, like signupClinic: an account
	 * without its page (or a page without its login) is never left behind. The account works
	 * at once and is flagged memberMustChangePassword — the clinic knows this password.
	 */
	public async createDoctor(agentId: ObjectId, input: DoctorCreateInput): Promise<Doctor> {
		const clinic = await this.clinicService.findClinicByMember(agentId);
		if (!clinic) throw new NotFoundException(Messages.NO_DATA_FOUND);
		if (CLOSED_CLINIC.includes(clinic.clinicStatus)) {
			throw new BadRequestException(Messages.CLINIC_CANNOT_ADD_DOCTORS);
		}

		const { memberEmail, memberPassword, ...profile } = input;
		const session = await this.connection.startSession();
		let member!: T;
		let doctor!: T;
		try {
			await session.withTransaction(async () => {
				member = await this.memberService.createEmailMember(
					{
						memberType: MemberType.DOCTOR,
						memberEmail,
						memberPassword,
						memberFullName: profile.doctorName,
						memberLang: Language.KO,
						memberMustChangePassword: true,
					},
					session,
				);
				const [created] = await this.doctorModel.create(
					[{ ...profile, clinicId: clinic._id, memberId: member._id }],
					{ session },
				);
				doctor = created.toObject();
			});
		} finally {
			await session.endSession();
		}

		await this.invalidateDoctor(doctor._id);
		const { memberPassword: _hash, ...memberData } = member;
		return { ...doctor, memberData } as Doctor;
	}

	/** The clinic's doctor table: every doctor except deleted ones, with the login email. */
	public async getMyClinicDoctors(agentId: ObjectId): Promise<Doctor[]> {
		const clinic = await this.ownClinic(agentId);
		return await this.doctorModel
			.aggregate([
				{ $match: { clinicId: clinic._id, doctorStatus: { $ne: DoctorStatus.DELETE } } },
				{ $sort: { createdAt: 1 } },
				...lookupMember,
			])
			.exec();
	}

	public async updateDoctorByClinic(agentId: ObjectId, input: DoctorClinicUpdate): Promise<Doctor> {
		const clinic = await this.ownClinic(agentId);
		const doctor = await this.doctorModel
			.findOneAndUpdate(
				{
					_id: this.toObjectId(input.doctorId),
					clinicId: clinic._id,
					doctorStatus: { $ne: DoctorStatus.DELETE },
				},
				{ $set: { doctorSpecialty: input.doctorSpecialty } },
				{ new: true },
			)
			.lean()
			.exec();
		if (!doctor) throw new NotFoundException(Messages.NO_DATA_FOUND);
		await this.invalidateDoctor(doctor._id);
		return doctor as Doctor;
	}

	public async hideDoctor(agentId: ObjectId, doctorId: string): Promise<Doctor> {
		return await this.moveByClinic(agentId, doctorId, DoctorStatus.ACTIVE, DoctorStatus.HIDDEN);
	}

	public async showDoctor(agentId: ObjectId, doctorId: string): Promise<Doctor> {
		return await this.moveByClinic(agentId, doctorId, DoctorStatus.HIDDEN, DoctorStatus.ACTIVE);
	}

	/**
	 * The page goes to DELETE and the account closes in the same transaction; the doctor is
	 * signed out everywhere after the commit. Follows, likes and views stay as history —
	 * every list already drops a doctor that is not ACTIVE.
	 */
	public async removeDoctor(agentId: ObjectId, doctorId: string): Promise<Doctor> {
		const clinic = await this.ownClinic(agentId);
		const _id = this.toObjectId(doctorId);

		const session = await this.connection.startSession();
		let doctor: T | null = null;
		try {
			await session.withTransaction(async () => {
				doctor = await this.doctorModel
					.findOneAndUpdate(
						{ _id, clinicId: clinic._id, doctorStatus: { $ne: DoctorStatus.DELETE } },
						{ $set: { doctorStatus: DoctorStatus.DELETE, deletedAt: new Date() } },
						{ new: true, session },
					)
					.lean()
					.exec();
				if (doctor) await this.memberService.closeAccount(doctor.memberId, session);
			});
		} finally {
			await session.endSession();
		}
		if (!doctor) throw new NotFoundException(Messages.NO_DATA_FOUND);

		await this.memberService.signOutEverywhere((doctor as T).memberId);
		await this.invalidateDoctor(_id);
		return doctor as Doctor;
	}

	public async resetDoctorPassword(
		agentId: ObjectId,
		input: DoctorPasswordReset,
	): Promise<boolean> {
		const clinic = await this.ownClinic(agentId);
		const doctor = await this.doctorModel
			.findOne({
				_id: this.toObjectId(input.doctorId),
				clinicId: clinic._id,
				doctorStatus: { $ne: DoctorStatus.DELETE },
			})
			.lean()
			.exec();
		if (!doctor) throw new NotFoundException(Messages.NO_DATA_FOUND);

		await this.memberService.setTemporaryPassword(doctor.memberId, input.newPassword);
		return true;
	}

	/* ───────────────────────── doctor account ───────────────────────── */

	/** The doctor's own panel shows the clinic whatever its status. */
	public async getMyDoctorProfile(memberId: ObjectId): Promise<Doctor> {
		const [doctor] = await this.doctorModel
			.aggregate([{ $match: { memberId } }, ...lookupClinic(false)])
			.exec();
		if (!doctor) throw new NotFoundException(Messages.NO_DATA_FOUND);
		return doctor as Doctor;
	}

	/**
	 * A rename also renames the account (memberFullName), so the follow list and the admin
	 * see the same name as the public page.
	 */
	public async updateMyDoctorProfile(
		memberId: ObjectId,
		input: DoctorProfileUpdate,
	): Promise<Doctor> {
		const doctor = await this.doctorModel
			.findOneAndUpdate(
				{ memberId, doctorStatus: { $ne: DoctorStatus.DELETE } },
				{ $set: { ...input } },
				{ new: true, runValidators: true },
			)
			.lean()
			.exec();
		if (!doctor) throw new NotFoundException(Messages.NO_DATA_FOUND);

		if (input.doctorName)
			await this.memberService.updateMember(memberId, { memberFullName: input.doctorName });
		await this.invalidateDoctor(doctor._id);
		return doctor as Doctor;
	}

	/* ───────────────────────── public ───────────────────────── */

	/**
	 * Cached together with its clinic card. The clinic must be ACTIVE: a doctor of a pending
	 * or suspended clinic is not public. meLiked / meFollowed are added after the cache.
	 */
	public async getDoctor(authMember: AuthMember | null, doctorId: string): Promise<Doctor> {
		const _id = this.toObjectId(doctorId);
		const doctor = await this.cacheService.wrap<T | null>(
			CacheKeys.doctorDetail(_id),
			DETAIL_TTL_SECONDS,
			() => this.findVisibleDoctor(_id),
		);
		if (!doctor) throw new NotFoundException(Messages.NO_DATA_FOUND);
		if (!authMember) return doctor as Doctor;

		if (authMember.memberType === MemberType.USER) {
			const firstVisit = await this.viewService.recordView({
				memberId: authMember._id,
				viewGroup: ViewGroup.DOCTOR,
				viewRefId: _id,
			});
			if (firstVisit) await this.doctorStatsEditor({ _id, targetKey: 'doctorViews', modifier: 1 });
		}

		const [meLiked, meFollowed] = await Promise.all([
			this.likeService.isLiked(authMember._id, _id),
			this.followService.isFollowing(authMember._id, doctor.memberId),
		]);
		return { ...doctor, meLiked, meFollowed } as Doctor;
	}

	public async getDoctors(authMember: AuthMember | null, input: DoctorsInquiry): Promise<Doctors> {
		const hash = createHash('sha1').update(JSON.stringify(input)).digest('hex');
		const page = await this.cacheService.wrap(CacheKeys.doctorList(hash), LIST_TTL_SECONDS, () =>
			this.loadDoctors(input),
		);
		return { ...page, list: await this.withViewerFlags(authMember, page.list) };
	}

	/**
	 * Visible = doctor ACTIVE and clinic ACTIVE. The clinic half comes from a cached list of
	 * active clinic ids (`$in`), so the query stays on one collection and pages through the
	 * { doctorStatus, createdAt } index — instead of a $lookup into clinics for every doctor
	 * before the page can be cut (option 1), or a copied `clinicActive` flag that every clinic
	 * status change must fan out to (option 2).
	 */
	private async loadDoctors(input: DoctorsInquiry): Promise<Doctors> {
		const { page, limit, sort = 'createdAt', direction = Direction.DESC, search = {} } = input;
		const activeClinicIds = await this.clinicService.getActiveClinicIds();

		const match: T = { doctorStatus: DoctorStatus.ACTIVE, clinicId: { $in: activeClinicIds } };
		if (search.clinicId) {
			const clinicId = String(search.clinicId);
			if (!activeClinicIds.some((id) => String(id) === clinicId))
				return { list: [], metaCounter: [] };
			match.clinicId = shapeIntoMongoObjectId(clinicId);
		}
		if (search.specialty) match.doctorSpecialty = search.specialty;
		if (search.langs?.length) match.doctorLangs = { $in: search.langs };
		if (search.text) {
			const pattern = new RegExp(escapeRegex(search.text.trim()), 'i');
			match.$or = [{ doctorName: pattern }, { doctorNameKo: pattern }];
		}

		const result = await this.doctorModel
			.aggregate([
				{ $match: match },
				{ $sort: { [sort]: direction, _id: direction } },
				{
					$facet: {
						// The clinic card is joined for the 10 rows of the page only.
						list: [{ $skip: (page - 1) * limit }, { $limit: limit }, ...lookupClinic(false)],
						metaCounter: [{ $count: 'total' }],
					},
				},
			])
			.exec();

		return result[0] as Doctors;
	}

	public async getFavoriteDoctors(memberId: ObjectId, input: OrdinaryInquiry): Promise<Doctors> {
		return await this.likeService.getFavoriteDoctors(memberId, input);
	}

	public async doctorStatsEditor(input: StatisticModifier): Promise<T | null> {
		const { _id, targetKey, modifier } = input;
		return await this.doctorModel
			.findByIdAndUpdate(_id, { $inc: { [targetKey]: modifier } }, { new: true })
			.lean()
			.exec();
	}

	/* ───────────────────────── admin ───────────────────────── */

	public async getAllDoctorsByAdmin(input: AdminDoctorsInquiry): Promise<Doctors> {
		const { page, limit, doctorStatus, text } = input;
		const match: T = {};
		if (doctorStatus) match.doctorStatus = doctorStatus;
		if (text) {
			const pattern = new RegExp(escapeRegex(text.trim()), 'i');
			match.$or = [{ doctorName: pattern }, { doctorNameKo: pattern }];
		}

		const result = await this.doctorModel
			.aggregate([
				{ $match: match },
				{ $sort: { createdAt: -1, _id: -1 } },
				{
					$facet: {
						list: [
							{ $skip: (page - 1) * limit },
							{ $limit: limit },
							...lookupClinic(false),
							...lookupMember,
						],
						metaCounter: [{ $count: 'total' }],
					},
				},
			])
			.exec();

		return result[0] as Doctors;
	}

	/** An admin suspension the clinic cannot undo: SUSPENDED is not part of hide/show. */
	public async suspendDoctor(adminId: ObjectId, input: DoctorStatusInput): Promise<Doctor> {
		return await this.moveByAdmin(
			adminId,
			input,
			DoctorStatus.ACTIVE,
			DoctorStatus.SUSPENDED,
			AuditAction.DOCTOR_SUSPEND,
		);
	}

	public async restoreDoctor(adminId: ObjectId, input: DoctorStatusInput): Promise<Doctor> {
		return await this.moveByAdmin(
			adminId,
			input,
			DoctorStatus.SUSPENDED,
			DoctorStatus.ACTIVE,
			AuditAction.DOCTOR_RESTORE,
		);
	}

	/* ───────────────────────── helpers ───────────────────────── */

	/** Doctor ACTIVE and clinic ACTIVE, with the clinic card attached; null otherwise. */
	private async findVisibleDoctor(_id: ObjectId): Promise<T | null> {
		const doctor = await this.doctorModel
			.findOne({ _id, doctorStatus: DoctorStatus.ACTIVE })
			.lean()
			.exec();
		if (!doctor) return null;
		const clinicData = await this.clinicService.findActiveClinic(doctor.clinicId);
		return clinicData ? { ...doctor, clinicData } : null;
	}

	/** Same as on clinic cards: per viewer, after the cache, one `$in` query each per page. */
	private async withViewerFlags(authMember: AuthMember | null, list: Doctor[]): Promise<Doctor[]> {
		if (!authMember || list.length === 0) return list;
		const [liked, followed] = await Promise.all([
			this.likeService.likedIds(
				authMember._id,
				list.map((doctor) => doctor._id),
			),
			this.followService.followedIds(
				authMember._id,
				list.map((doctor) => doctor.memberId),
			),
		]);
		return list.map((doctor) => ({
			...doctor,
			meLiked: liked.has(String(doctor._id)),
			meFollowed: followed.has(String(doctor.memberId)),
		}));
	}

	private async ownClinic(agentId: ObjectId): Promise<T> {
		const clinic = await this.clinicService.findClinicByMember(agentId);
		if (!clinic) throw new NotFoundException(Messages.NO_DATA_FOUND);
		return clinic;
	}

	/** A doctor of another clinic is answered as "not found", never "forbidden": no hint it exists. */
	private async moveByClinic(
		agentId: ObjectId,
		doctorId: string,
		from: DoctorStatus,
		to: DoctorStatus,
	): Promise<Doctor> {
		const clinic = await this.ownClinic(agentId);
		const _id = this.toObjectId(doctorId);
		const doctor = await this.doctorModel
			.findOneAndUpdate(
				{ _id, clinicId: clinic._id, doctorStatus: from },
				{ $set: { doctorStatus: to } },
				{ new: true },
			)
			.lean()
			.exec();
		if (!doctor) await this.explainRefusal(_id, from, clinic._id);

		await this.invalidateDoctor(_id);
		return doctor as Doctor;
	}

	private async moveByAdmin(
		adminId: ObjectId,
		input: DoctorStatusInput,
		from: DoctorStatus,
		to: DoctorStatus,
		auditAction: AuditAction,
	): Promise<Doctor> {
		const _id = this.toObjectId(input.doctorId);
		const doctor = await this.doctorModel
			.findOneAndUpdate({ _id, doctorStatus: from }, { $set: { doctorStatus: to } }, { new: true })
			.lean()
			.exec();
		if (!doctor) await this.explainRefusal(_id, from);

		await this.auditLogService.record({
			auditAction,
			auditGroup: AuditGroup.DOCTOR,
			auditRefId: _id,
			auditNote: input.note?.trim(),
			memberId: adminId,
		});
		await this.invalidateDoctor(_id);
		return doctor as Doctor;
	}

	private async explainRefusal(
		_id: ObjectId,
		expected: DoctorStatus,
		clinicId?: unknown,
	): Promise<never> {
		const filter: T = { _id };
		if (clinicId) filter.clinicId = clinicId;
		const current = await this.doctorModel.findOne(filter, { doctorStatus: 1 }).lean().exec();
		if (!current || current.doctorStatus === DoctorStatus.DELETE) {
			throw new NotFoundException(Messages.NO_DATA_FOUND);
		}
		if (current.doctorStatus !== expected) throw new BadRequestException(Messages.WRONG_STATUS);
		throw new BadRequestException(Messages.UPDATE_FAILED);
	}

	private toObjectId(id: string): ObjectId {
		if (!Types.ObjectId.isValid(id)) throw new NotFoundException(Messages.NO_DATA_FOUND);
		return shapeIntoMongoObjectId(id) as ObjectId;
	}

	private async invalidateDoctor(doctorId: unknown): Promise<void> {
		await this.cacheService.del(CacheKeys.doctorDetail(doctorId));
		await this.cacheService.invalidate(CacheKeys.doctorListPattern);
	}
}
