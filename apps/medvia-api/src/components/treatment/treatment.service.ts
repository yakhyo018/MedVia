import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, ObjectId, Types } from 'mongoose';
import { Treatment, Treatments } from '../../libs/dto/treatment/treatment';
import {
	AdminTreatmentsInquiry,
	ClinicTreatmentsInquiry,
	TreatmentCreateInput,
	TreatmentReviewInput,
	TreatmentUpdate,
} from '../../libs/dto/treatment/treatment.input';
import { AuditAction, AuditGroup, ReviewDecision } from '../../libs/enums/admin.enum';
import { ClinicStatus } from '../../libs/enums/clinic.enum';
import { Messages } from '../../libs/enums/common.enum';
import { DoctorStatus } from '../../libs/enums/doctor.enum';
import { TreatmentStatus } from '../../libs/enums/treatment.enum';
import { T } from '../../libs/types/common';
import { shapeIntoMongoObjectId } from '../../libs/config';
import { ClinicService } from '../clinic/clinic.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { planLiveEdit } from './treatment.rules';

/** Never approved yet: every edit applies at once, the treatment is still under review. */
const NEVER_LIVE = [TreatmentStatus.PENDING, TreatmentStatus.CHANGES_REQUESTED];

/** Approved at least once: medical-ad edits wait in the draft. */
const LIVE = [TreatmentStatus.ACTIVE, TreatmentStatus.HIDDEN];

const AUTO_HIDDEN_NOTE = 'Hidden automatically: no doctor of the clinic performs it any more.';

@Injectable()
export class TreatmentService {
	constructor(
		@InjectModel('Treatment') private readonly treatmentModel: Model<Treatment>,
		@InjectModel('Doctor') private readonly doctorModel: Model<T>,
		private readonly clinicService: ClinicService,
		private readonly auditLogService: AuditLogService,
	) {}

	/* ───────────────────────── clinic account ───────────────────────── */

	public async createTreatment(agentId: ObjectId, input: TreatmentCreateInput): Promise<Treatment> {
		const clinic = await this.ownClinic(agentId);
		if ([ClinicStatus.REJECTED, ClinicStatus.DELETE].includes(clinic.clinicStatus)) {
			throw new BadRequestException(Messages.CLINIC_CANNOT_ADD_TREATMENTS);
		}

		const doctorIds = await this.validDoctors(clinic._id, input.doctorIds);
		const created = await this.treatmentModel.create({
			...input,
			doctorIds,
			clinicId: clinic._id,
			treatmentStatus: TreatmentStatus.PENDING,
			submittedAt: new Date(),
		});
		return await this.withDoctors(created.toObject(), false);
	}

	/**
	 * One form, three outcomes per field:
	 * - never approved yet → everything applies now (it is still waiting for review);
	 * - live, operational field (doctors, duration, languages, aftercare) → applies now;
	 * - live, medical-ad field → waits in treatmentDraft; the live values keep serving.
	 * Price is split by direction: a higher price applies now (it misleads no one, and the
	 * clinic should not have to serve at the old price), a lower one waits — "from ₩10,000"
	 * to draw patients in is exactly what the review is for.
	 *
	 * The write is conditional on the status that was read (same TOCTOU guard as clinics).
	 */
	public async updateTreatment(agentId: ObjectId, input: TreatmentUpdate): Promise<Treatment> {
		const clinic = await this.ownClinic(agentId);
		const current = await this.findOwnTreatment(clinic._id, input.treatmentId);
		if (current.treatmentStatus === TreatmentStatus.REJECTED) {
			throw new BadRequestException(Messages.WRONG_STATUS);
		}

		const { treatmentId: _id, doctorIds, ...fields } = input;
		const set: T = {};
		const unset: T = {};
		if (doctorIds) set.doctorIds = await this.validDoctors(clinic._id, doctorIds);

		if (NEVER_LIVE.includes(current.treatmentStatus)) {
			Object.assign(set, this.defined(fields));
		} else {
			const plan = planLiveEdit(current, fields);
			Object.assign(set, plan.set);
			Object.assign(unset, plan.unset);
		}

		const update: T = {};
		if (Object.keys(set).length) update.$set = set;
		if (Object.keys(unset).length) update.$unset = unset;
		if (!update.$set && !update.$unset) return await this.withDoctors(current, false);

		const updated = await this.treatmentModel
			.findOneAndUpdate({ _id: current._id, treatmentStatus: current.treatmentStatus }, update, {
				new: true,
				runValidators: true,
			})
			.lean()
			.exec();
		if (!updated) throw new BadRequestException(Messages.WRONG_STATUS);

		if (updated.treatmentStatus === TreatmentStatus.ACTIVE)
			await this.refreshClinicSummary(clinic._id);
		return await this.withDoctors(updated, false);
	}

	/** After "request edit": the clinic fixed the treatment and sends it again. */
	public async resubmitTreatment(agentId: ObjectId, treatmentId: string): Promise<Treatment> {
		const clinic = await this.ownClinic(agentId);
		const treatment = await this.treatmentModel
			.findOneAndUpdate(
				{
					_id: this.toObjectId(treatmentId),
					clinicId: clinic._id,
					treatmentStatus: TreatmentStatus.CHANGES_REQUESTED,
				},
				{ $set: { treatmentStatus: TreatmentStatus.PENDING, submittedAt: new Date() } },
				{ new: true },
			)
			.lean()
			.exec();
		if (!treatment) throw new BadRequestException(Messages.WRONG_STATUS);
		return await this.withDoctors(treatment, false);
	}

	/**
	 * "Cancel" next to "In review": a treatment that was never live is removed; a live one
	 * drops its waiting edit and keeps serving the approved values.
	 */
	public async cancelTreatmentReview(agentId: ObjectId, treatmentId: string): Promise<Treatment> {
		const clinic = await this.ownClinic(agentId);
		const current = await this.findOwnTreatment(clinic._id, treatmentId);

		let filter: T;
		let update: T;
		if (NEVER_LIVE.includes(current.treatmentStatus)) {
			filter = { _id: current._id, treatmentStatus: current.treatmentStatus };
			update = { $set: { treatmentStatus: TreatmentStatus.DELETE, deletedAt: new Date() } };
		} else if (current.treatmentDraft) {
			filter = { _id: current._id, treatmentDraft: { $exists: true } };
			update = { $unset: { treatmentDraft: 1 } };
		} else {
			throw new BadRequestException(Messages.NOTHING_TO_REVIEW);
		}

		const treatment = await this.treatmentModel
			.findOneAndUpdate(filter, update, { new: true })
			.lean()
			.exec();
		if (!treatment) throw new BadRequestException(Messages.WRONG_STATUS);
		return await this.withDoctors(treatment, false);
	}

	public async hideTreatment(agentId: ObjectId, treatmentId: string): Promise<Treatment> {
		return await this.moveByClinic(
			agentId,
			treatmentId,
			TreatmentStatus.ACTIVE,
			TreatmentStatus.HIDDEN,
		);
	}

	/** Back to ACTIVE — but never without a doctor: patients book a doctor, not a treatment. */
	public async showTreatment(agentId: ObjectId, treatmentId: string): Promise<Treatment> {
		return await this.moveByClinic(
			agentId,
			treatmentId,
			TreatmentStatus.HIDDEN,
			TreatmentStatus.ACTIVE,
		);
	}

	public async removeTreatment(agentId: ObjectId, treatmentId: string): Promise<Treatment> {
		const clinic = await this.ownClinic(agentId);
		const treatment = await this.treatmentModel
			.findOneAndUpdate(
				{
					_id: this.toObjectId(treatmentId),
					clinicId: clinic._id,
					treatmentStatus: { $ne: TreatmentStatus.DELETE },
				},
				{ $set: { treatmentStatus: TreatmentStatus.DELETE, deletedAt: new Date() } },
				{ new: true },
			)
			.lean()
			.exec();
		if (!treatment) throw new NotFoundException(Messages.NO_DATA_FOUND);

		await this.refreshClinicSummary(clinic._id);
		return await this.withDoctors(treatment, false);
	}

	/** The clinic's table: every treatment except deleted ones, with drafts and all doctors. */
	public async getMyClinicTreatments(agentId: ObjectId): Promise<Treatment[]> {
		const clinic = await this.ownClinic(agentId);
		return await this.treatmentModel
			.aggregate([
				{ $match: { clinicId: clinic._id, treatmentStatus: { $ne: TreatmentStatus.DELETE } } },
				{ $sort: { createdAt: 1 } },
				this.lookupDoctors(false),
			])
			.exec();
	}

	/* ───────────────────────── public ───────────────────────── */

	/**
	 * The treatments on a clinic page, or with doctorId "Treatments by Dr. Han". Live values
	 * only — the draft and the admin's note never leave for a patient — and only doctors who
	 * are ACTIVE on the chips. Not cached: one indexed query per page view, and caching it
	 * would need invalidation on every treatment, doctor and clinic change.
	 */
	public async getClinicTreatments(input: ClinicTreatmentsInquiry): Promise<Treatment[]> {
		const clinic = await this.clinicService.findActiveClinic(
			shapeIntoMongoObjectId(input.clinicId),
		);
		if (!clinic) throw new NotFoundException(Messages.NO_DATA_FOUND);

		const match: T = { clinicId: clinic._id, treatmentStatus: TreatmentStatus.ACTIVE };
		if (input.doctorId) {
			const doctorId = shapeIntoMongoObjectId(input.doctorId);
			const doctorLive = await this.doctorModel
				.exists({ _id: doctorId, clinicId: clinic._id, doctorStatus: DoctorStatus.ACTIVE })
				.exec();
			if (!doctorLive) return [];
			match.doctorIds = doctorId;
		}

		return await this.treatmentModel
			.aggregate([
				{ $match: match },
				{ $sort: { treatmentPrice: 1, _id: 1 } },
				{ $project: { treatmentDraft: 0, treatmentReviewNote: 0 } },
				this.lookupDoctors(true),
			])
			.exec();
	}

	/* ───────────────────────── admin ───────────────────────── */

	/**
	 * reviewQueue: new treatments and edits of live ones in one list, oldest first — the
	 * "Pending" tab. Each row is ordered by when it entered the queue: the draft's time for an
	 * edit, submittedAt for a new treatment.
	 */
	public async getTreatmentsByAdmin(input: AdminTreatmentsInquiry): Promise<Treatments> {
		const { page, limit, reviewQueue, treatmentStatus } = input;

		const head: T[] = [];
		if (reviewQueue) {
			head.push(
				{
					$match: {
						$or: [
							{ treatmentStatus: TreatmentStatus.PENDING },
							{ treatmentStatus: { $in: LIVE }, treatmentDraft: { $exists: true } },
						],
					},
				},
				{ $addFields: { queueAt: { $ifNull: ['$treatmentDraft.submittedAt', '$submittedAt'] } } },
				{ $sort: { queueAt: 1, _id: 1 } },
			);
		} else {
			head.push(
				{
					$match: treatmentStatus
						? { treatmentStatus }
						: { treatmentStatus: { $ne: TreatmentStatus.DELETE } },
				},
				{ $sort: { createdAt: -1, _id: -1 } },
			);
		}

		const result = await this.treatmentModel
			.aggregate([
				...head,
				{
					$facet: {
						list: [
							{ $skip: (page - 1) * limit },
							{ $limit: limit },
							{
								$lookup: {
									from: 'clinics',
									localField: 'clinicId',
									foreignField: '_id',
									as: 'clinicData',
								},
							},
							{ $unwind: { path: '$clinicData', preserveNullAndEmptyArrays: true } },
							this.lookupDoctors(false),
						],
						metaCounter: [{ $count: 'total' }],
					},
				},
			] as any[])
			.exec();
		return result[0] as Treatments;
	}

	/**
	 * Decides whatever is waiting: a new treatment (PENDING) or the edit of a live one.
	 *
	 * For an edit, the filter carries the draft version the admin saw (draftSubmittedAt from
	 * the review page). If the clinic changed the draft between the admin opening it and
	 * clicking "Approve", the filter matches nothing and the admin is told to reload — an
	 * approval never applies text the admin did not see. Optimistic concurrency: a version
	 * check in the write itself, no lock held while the admin reads.
	 */
	public async reviewTreatment(adminId: ObjectId, input: TreatmentReviewInput): Promise<Treatment> {
		const _id = this.toObjectId(input.treatmentId);
		const note = input.treatmentReviewNote?.trim();
		if (input.decision !== ReviewDecision.APPROVE && !note) {
			throw new BadRequestException(Messages.REVIEW_NOTE_REQUIRED);
		}

		const current = await this.treatmentModel.findById(_id).lean().exec();
		if (!current || current.treatmentStatus === TreatmentStatus.DELETE) {
			throw new NotFoundException(Messages.NO_DATA_FOUND);
		}

		let filter: T;
		let update: T;
		let auditAction: AuditAction;
		let refusal: Messages;

		if (current.treatmentStatus === TreatmentStatus.PENDING) {
			filter = { _id, treatmentStatus: TreatmentStatus.PENDING };
			refusal = Messages.WRONG_STATUS;
			if (input.decision === ReviewDecision.APPROVE) {
				filter['doctorIds.0'] = { $exists: true };
				refusal = Messages.TREATMENT_NEEDS_DOCTOR;
				update = {
					$set: { treatmentStatus: TreatmentStatus.ACTIVE, verifiedAt: new Date() },
					$unset: { treatmentReviewNote: 1 },
				};
				auditAction = AuditAction.TREATMENT_APPROVE;
			} else if (input.decision === ReviewDecision.REQUEST_CHANGES) {
				update = {
					$set: { treatmentStatus: TreatmentStatus.CHANGES_REQUESTED, treatmentReviewNote: note },
				};
				auditAction = AuditAction.TREATMENT_REQUEST_CHANGES;
			} else {
				update = { $set: { treatmentStatus: TreatmentStatus.REJECTED, treatmentReviewNote: note } };
				auditAction = AuditAction.TREATMENT_REJECT;
			}
		} else if (LIVE.includes(current.treatmentStatus) && current.treatmentDraft) {
			// The version the admin saw; without one, the version read just now.
			const seen = input.draftSubmittedAt ?? current.treatmentDraft.submittedAt;
			filter = { _id, 'treatmentDraft.submittedAt': seen };
			refusal = Messages.DRAFT_CHANGED;
			if (input.decision === ReviewDecision.APPROVE) {
				const { submittedAt: _seen, ...changes } = current.treatmentDraft as T;
				update = {
					$set: { ...this.defined(changes) },
					$unset: { treatmentDraft: 1, treatmentReviewNote: 1 },
				};
				auditAction = AuditAction.TREATMENT_EDIT_APPROVE;
			} else {
				// "Request edit" and "reject" both drop the waiting edit; the note says why.
				update = { $set: { treatmentReviewNote: note }, $unset: { treatmentDraft: 1 } };
				auditAction = AuditAction.TREATMENT_EDIT_REJECT;
			}
		} else {
			throw new BadRequestException(Messages.NOTHING_TO_REVIEW);
		}

		const treatment = await this.treatmentModel
			.findOneAndUpdate(filter, update, { new: true })
			.lean()
			.exec();
		if (!treatment) throw new BadRequestException(refusal);

		await this.auditLogService.record({
			auditAction,
			auditGroup: AuditGroup.TREATMENT,
			auditRefId: _id,
			auditNote: note,
			memberId: adminId,
		});
		await this.refreshClinicSummary(treatment.clinicId);
		return await this.withDoctors(treatment, false);
	}

	/* ───────────────────────── called by other modules ───────────────────────── */

	/**
	 * A clinic removed a doctor (inside its transaction): take the doctor off every treatment,
	 * and hide the live treatments nobody performs any more. The caller refreshes the clinic
	 * summary after the commit.
	 */
	public async detachDoctor(
		clinicId: unknown,
		doctorId: unknown,
		session: ClientSession,
	): Promise<void> {
		await this.treatmentModel
			.updateMany(
				{ clinicId, doctorIds: doctorId },
				{ $pull: { doctorIds: doctorId } },
				{ session },
			)
			.exec();
		await this.treatmentModel
			.updateMany(
				{ clinicId, treatmentStatus: TreatmentStatus.ACTIVE, doctorIds: { $size: 0 } },
				{
					$set: { treatmentStatus: TreatmentStatus.HIDDEN, treatmentReviewNote: AUTO_HIDDEN_NOTE },
				},
				{ session },
			)
			.exec();
	}

	/**
	 * clinicMinPrice and clinicTreatmentNames, recomputed from the ACTIVE treatments and written
	 * whole. Recomputing instead of adjusting is what keeps the copy honest: hiding the cheapest
	 * treatment needs the next-cheapest, which no $inc could know. Running it twice is harmless.
	 */
	public async refreshClinicSummary(clinicId: unknown): Promise<void> {
		const [summary] = await this.treatmentModel
			.aggregate([
				{ $match: { clinicId, treatmentStatus: TreatmentStatus.ACTIVE } },
				{
					$group: {
						_id: null,
						minPrice: { $min: '$treatmentPrice' },
						names: { $addToSet: '$treatmentName' },
					},
				},
			])
			.exec();
		await this.clinicService.setTreatmentSummary(
			clinicId,
			summary?.minPrice ?? null,
			(summary?.names ?? []).sort(),
		);
	}

	/* ───────────────────────── helpers ───────────────────────── */

	/** All ids must be doctors of this clinic that are not deleted. */
	private async validDoctors(clinicId: unknown, ids: string[]): Promise<ObjectId[]> {
		const objectIds = ids.map((id) => shapeIntoMongoObjectId(id) as ObjectId);
		const found = await this.doctorModel
			.countDocuments({
				_id: { $in: objectIds },
				clinicId,
				doctorStatus: { $ne: DoctorStatus.DELETE },
			})
			.exec();
		if (objectIds.length === 0 || found !== objectIds.length) {
			throw new BadRequestException(Messages.INVALID_DOCTORS);
		}
		return objectIds;
	}

	/** Doctor chips: public pages show only ACTIVE doctors; the clinic and admin see all but deleted. */
	private lookupDoctors(onlyActive: boolean): any {
		return {
			$lookup: {
				from: 'doctors',
				localField: 'doctorIds',
				foreignField: '_id',
				pipeline: [
					{
						$match: onlyActive
							? { doctorStatus: DoctorStatus.ACTIVE }
							: { doctorStatus: { $ne: DoctorStatus.DELETE } },
					},
					{ $sort: { createdAt: 1 } },
				],
				as: 'doctors',
			},
		};
	}

	private async withDoctors(treatment: T, onlyActive: boolean): Promise<Treatment> {
		const doctors = await this.doctorModel
			.find({
				_id: { $in: treatment.doctorIds ?? [] },
				doctorStatus: onlyActive ? DoctorStatus.ACTIVE : { $ne: DoctorStatus.DELETE },
			})
			.sort({ createdAt: 1 })
			.lean()
			.exec();
		return { ...treatment, doctors } as unknown as Treatment;
	}

	private async moveByClinic(
		agentId: ObjectId,
		treatmentId: string,
		from: TreatmentStatus,
		to: TreatmentStatus,
	): Promise<Treatment> {
		const clinic = await this.ownClinic(agentId);
		const current = await this.findOwnTreatment(clinic._id, treatmentId);
		if (current.treatmentStatus !== from) throw new BadRequestException(Messages.WRONG_STATUS);

		const filter: T = { _id: current._id, treatmentStatus: from };
		if (to === TreatmentStatus.ACTIVE) filter['doctorIds.0'] = { $exists: true };

		const treatment = await this.treatmentModel
			.findOneAndUpdate(filter, { $set: { treatmentStatus: to } }, { new: true })
			.lean()
			.exec();
		if (!treatment) {
			throw new BadRequestException(
				to === TreatmentStatus.ACTIVE && !current.doctorIds?.length
					? Messages.TREATMENT_NEEDS_DOCTOR
					: Messages.WRONG_STATUS,
			);
		}

		await this.refreshClinicSummary(clinic._id);
		return await this.withDoctors(treatment, false);
	}

	/** Another clinic's treatment is "not found" — no hint that the id exists. */
	private async findOwnTreatment(clinicId: unknown, treatmentId: string): Promise<T> {
		const treatment = await this.treatmentModel
			.findOne({
				_id: this.toObjectId(treatmentId),
				clinicId,
				treatmentStatus: { $ne: TreatmentStatus.DELETE },
			})
			.lean()
			.exec();
		if (!treatment) throw new NotFoundException(Messages.NO_DATA_FOUND);
		return treatment;
	}

	private async ownClinic(agentId: ObjectId): Promise<T> {
		const clinic = await this.clinicService.findClinicByMember(agentId);
		if (!clinic) throw new NotFoundException(Messages.NO_DATA_FOUND);
		return clinic;
	}

	private defined(fields: T): T {
		return Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined));
	}

	private toObjectId(id: string): ObjectId {
		if (!Types.ObjectId.isValid(id)) throw new NotFoundException(Messages.NO_DATA_FOUND);
		return shapeIntoMongoObjectId(id) as ObjectId;
	}
}
