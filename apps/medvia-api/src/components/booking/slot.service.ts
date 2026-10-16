import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { ClientSession, Connection, Model, ObjectId, Types } from 'mongoose';
import { Slot, SlotHold, SlotsCreated } from '../../libs/dto/slot/slot';
import {
	AvailableSlotsInquiry,
	ClinicScheduleInquiry,
	SlotHoldInput,
	SlotsBlockInput,
	SlotsCreateInput,
} from '../../libs/dto/slot/slot.input';
import { SlotStatus } from '../../libs/enums/booking.enum';
import { ClinicStatus } from '../../libs/enums/clinic.enum';
import { Messages } from '../../libs/enums/common.enum';
import { DoctorStatus } from '../../libs/enums/doctor.enum';
import { TreatmentStatus } from '../../libs/enums/treatment.enum';
import { T } from '../../libs/types/common';
import { shapeIntoMongoObjectId, toDisplayName } from '../../libs/config';
import { ClinicService } from '../clinic/clinic.service';
import {
	addDays,
	earliestBookable,
	effectiveSlotStatus,
	effectiveStatus,
	freeSlotFilter,
	holdUntil,
	planSlotStarts,
	SLOT_MINUTES,
	bookableStarts,
	seoulToUtc,
	slotsNeeded,
} from './booking.rules';

const SLOT_MS = SLOT_MINUTES * 60_000;

/** A clinic in these states cannot open new slots. Before approval it can: nobody books yet. */
const CLOSED_CLINIC = [ClinicStatus.REJECTED, ClinicStatus.DELETE];

export interface Bookable {
	treatment: T;
	clinic: T;
	doctor: T;
}

/**
 * The only writer of `slots`. The clinic's schedule, the patient's time picker and the hold
 * live here; BookingService moves slots only through attachHeldSlots and applyBookingEffect,
 * inside its own transaction.
 */
@Injectable()
export class SlotService {
	constructor(
		@InjectModel('Slot') private readonly slotModel: Model<T>,
		@InjectModel('Treatment') private readonly treatmentModel: Model<T>,
		@InjectModel('Doctor') private readonly doctorModel: Model<T>,
		@InjectConnection() private readonly connection: Connection,
		private readonly clinicService: ClinicService,
	) {}

	/* ───────────────────────── clinic account ───────────────────────── */

	/**
	 * "Add slots". An upsert per start time instead of insertMany: a time that already has a
	 * slot is left untouched (whatever its status), and running the same request twice
	 * creates nothing new. The unique {doctorId, slotStart} index is the backstop.
	 */
	public async createSlots(agentId: ObjectId, input: SlotsCreateInput): Promise<SlotsCreated> {
		const clinic = await this.ownClinic(agentId);
		if (CLOSED_CLINIC.includes(clinic.clinicStatus)) {
			throw new BadRequestException(Messages.WRONG_STATUS);
		}
		const doctorId = this.toObjectId(input.doctorId);
		const doctor = await this.doctorModel
			.exists({ _id: doctorId, clinicId: clinic._id, doctorStatus: { $ne: DoctorStatus.DELETE } })
			.exec();
		if (!doctor) throw new NotFoundException(Messages.NO_DATA_FOUND);

		const starts = planSlotStarts(input, clinic.clinicHours ?? [], new Date());
		if (!starts.length) return { created: 0, planned: 0 };

		const result = await this.slotModel.bulkWrite(
			starts.map((slotStart) => ({
				updateOne: {
					filter: { doctorId, slotStart },
					update: {
						$setOnInsert: {
							doctorId,
							slotStart,
							clinicId: clinic._id,
							slotStatus: SlotStatus.OPEN,
						},
					},
					upsert: true,
				},
			})),
			{ ordered: false },
		);
		return { created: result.upsertedCount, planned: starts.length };
	}

	/**
	 * "Block time" and its undo, all or nothing: blocking needs every slot free (OPEN or an
	 * expired hold), unblocking needs every slot BLOCKED. One taken slot refuses the whole
	 * request — the clinic sees why instead of a half-applied change.
	 */
	public async setSlotsBlocked(agentId: ObjectId, input: SlotsBlockInput): Promise<Slot[]> {
		const clinic = await this.ownClinic(agentId);
		const ids = input.slotIds.map((id) => this.toObjectId(id));
		const now = new Date();

		const filter: T = input.blocked
			? { _id: { $in: ids }, clinicId: clinic._id, ...freeSlotFilter(now) }
			: { _id: { $in: ids }, clinicId: clinic._id, slotStatus: SlotStatus.BLOCKED };
		const update: T = input.blocked
			? {
					$set: { slotStatus: SlotStatus.BLOCKED, slotBlockReason: input.slotBlockReason?.trim() },
					$unset: { holdExpiresAt: 1, holdMemberId: 1, bookingId: 1 },
				}
			: { $set: { slotStatus: SlotStatus.OPEN }, $unset: { slotBlockReason: 1 } };

		await this.inTransaction(async (session) => {
			const result = await this.slotModel.updateMany(filter, update, { session }).exec();
			if (result.modifiedCount !== ids.length) {
				throw new BadRequestException(Messages.SLOT_NOT_AVAILABLE);
			}
		});

		const slots = await this.slotModel
			.find({ _id: { $in: ids } })
			.sort({ slotStart: 1 })
			.lean()
			.exec();
		return slots.map(
			(slot) => ({ ...slot, slotStatus: effectiveSlotStatus(slot, now) }) as unknown as Slot,
		);
	}

	/**
	 * The clinic's week: every slot of seven Seoul days, with "Feride K. · Laser Toning" on
	 * the taken ones. One aggregation; the nested lookups bring the patient and treatment name.
	 */
	public async getClinicSchedule(agentId: ObjectId, input: ClinicScheduleInquiry): Promise<Slot[]> {
		const clinic = await this.ownClinic(agentId);
		const match: T = {
			clinicId: clinic._id,
			slotStart: {
				$gte: seoulToUtc(input.dateFrom, 0),
				$lt: seoulToUtc(addDays(input.dateFrom, 7), 0),
			},
		};
		if (input.doctorId) match.doctorId = this.toObjectId(input.doctorId);

		const slots = await this.slotModel
			.aggregate([
				{ $match: match },
				{ $sort: { slotStart: 1, doctorId: 1 } },
				{
					$lookup: {
						from: 'bookings',
						localField: 'bookingId',
						foreignField: '_id',
						pipeline: [
							{
								$lookup: {
									from: 'members',
									localField: 'memberId',
									foreignField: '_id',
									pipeline: [{ $project: { memberFullName: 1 } }],
									as: 'member',
								},
							},
							{
								$lookup: {
									from: 'treatments',
									localField: 'treatmentId',
									foreignField: '_id',
									pipeline: [{ $project: { treatmentName: 1 } }],
									as: 'treatment',
								},
							},
							{
								$project: {
									bookingCode: 1,
									bookingStatus: 1,
									respondDeadline: 1,
									patientName: { $first: '$member.memberFullName' },
									treatmentName: { $first: '$treatment.treatmentName' },
								},
							},
						],
						as: 'bookingData',
					},
				},
				{ $unwind: { path: '$bookingData', preserveNullAndEmptyArrays: true } },
			])
			.exec();

		const now = new Date();
		return slots.map((slot) => {
			const slotStatus = effectiveSlotStatus(slot, now);
			// A dead hold is just a free slot: no patient name on it.
			if (slotStatus === SlotStatus.OPEN || !slot.bookingData) {
				const { bookingData: _b, bookingId: _id, holdExpiresAt: _h, ...rest } = slot;
				return { ...rest, slotStatus } as Slot;
			}
			const booking = slot.bookingData;
			return {
				...slot,
				slotStatus,
				bookingData: {
					bookingCode: booking.bookingCode,
					bookingStatus: effectiveStatus(booking, now),
					patientName: toDisplayName(booking.patientName ?? '', true),
					treatmentName: booking.treatmentName ?? '',
				},
			} as Slot;
		});
	}

	/* ───────────────────────── patient ───────────────────────── */

	/**
	 * The time picker: start times on one Seoul day where the treatment's slots are free in a
	 * row. Public — it says only "free at 10:00", never who holds the rest.
	 */
	public async getAvailableSlots(input: AvailableSlotsInquiry): Promise<Date[]> {
		const { treatment, doctor } = await this.findBookable(input.treatmentId, input.doctorId);
		const now = new Date();
		const free = await this.slotModel
			.find(
				{
					doctorId: doctor._id,
					slotStart: {
						$gte: seoulToUtc(input.date, 0),
						$lt: seoulToUtc(addDays(input.date, 1), 0),
					},
					...freeSlotFilter(now),
				},
				{ slotStart: 1 },
			)
			.lean()
			.exec();
		return bookableStarts(
			free.map((slot) => slot.slotStart),
			slotsNeeded(treatment.treatmentDuration),
			earliestBookable(now),
		);
	}

	/**
	 * Step 1 of the booking: hold the treatment's consecutive slots for 10 minutes.
	 *
	 * One transaction: release this patient's previous hold (one form at a time), then take
	 * all n slots with one conditional updateMany. If fewer than n matched the "free" filter —
	 * someone else was faster, or a slot is blocked — the throw aborts the transaction and
	 * nothing is held. Two patients racing for the same slot: both transactions write the same
	 * document, MongoDB lets one commit and gives the other a WriteConflict; withTransaction
	 * retries it, the filter no longer matches, and that patient gets SLOT_NOT_AVAILABLE.
	 */
	public async holdSlots(memberId: ObjectId, input: SlotHoldInput): Promise<SlotHold> {
		const { treatment, doctor } = await this.findBookable(input.treatmentId, input.doctorId);
		const now = new Date();
		if (input.slotStart < earliestBookable(now))
			throw new BadRequestException(Messages.SLOT_TOO_SOON);

		const starts = this.consecutiveStarts(
			input.slotStart,
			slotsNeeded(treatment.treatmentDuration),
		);
		const holdExpiresAt = holdUntil(now);
		let slotIds: ObjectId[] = [];

		await this.inTransaction(async (session) => {
			await this.slotModel
				.updateMany(
					{ holdMemberId: memberId, slotStatus: SlotStatus.HELD },
					{ $set: { slotStatus: SlotStatus.OPEN }, $unset: { holdMemberId: 1, holdExpiresAt: 1 } },
					{ session },
				)
				.exec();

			const slots = await this.slotModel
				.find({ doctorId: doctor._id, slotStart: { $in: starts } }, { _id: 1 }, { session })
				.lean()
				.exec();
			if (slots.length !== starts.length)
				throw new BadRequestException(Messages.SLOT_NOT_AVAILABLE);
			slotIds = slots.map((slot) => slot._id as ObjectId);

			const result = await this.slotModel
				.updateMany(
					{ _id: { $in: slotIds }, ...freeSlotFilter(now) },
					{
						$set: { slotStatus: SlotStatus.HELD, holdMemberId: memberId, holdExpiresAt },
						// A dead hold of an expired request still points at that booking.
						$unset: { bookingId: 1 },
					},
					{ session },
				)
				.exec();
			if (result.modifiedCount !== starts.length) {
				throw new BadRequestException(Messages.SLOT_NOT_AVAILABLE);
			}
		});

		return { slotIds, slotStart: input.slotStart, holdExpiresAt };
	}

	/* ───────────────────────── called by BookingService ───────────────────────── */

	/**
	 * Treatment ACTIVE and performed by this doctor, clinic ACTIVE, doctor ACTIVE in that
	 * clinic. Checked on the time picker, on the hold and again when the request is sent.
	 */
	public async findBookable(treatmentId: string, doctorId: string): Promise<Bookable> {
		const doctorObjectId = this.toObjectId(doctorId);
		const treatment = await this.treatmentModel
			.findOne({
				_id: this.toObjectId(treatmentId),
				treatmentStatus: TreatmentStatus.ACTIVE,
				doctorIds: doctorObjectId,
			})
			.lean()
			.exec();
		const clinic = treatment && (await this.clinicService.findActiveClinic(treatment.clinicId));
		const doctor =
			clinic &&
			(await this.doctorModel
				.findOne({ _id: doctorObjectId, clinicId: clinic._id, doctorStatus: DoctorStatus.ACTIVE })
				.lean()
				.exec());
		if (!treatment || !clinic || !doctor) {
			throw new BadRequestException(Messages.TREATMENT_NOT_BOOKABLE);
		}
		return { treatment, clinic: clinic as T, doctor };
	}

	/**
	 * Step 4: the request is sent. The patient's live hold on all n slots becomes the
	 * booking's hold, which now lasts until the clinic's deadline.
	 */
	public async attachHeldSlots(
		memberId: ObjectId,
		doctorId: unknown,
		slotStart: Date,
		needed: number,
		bookingId: unknown,
		deadline: Date,
		now: Date,
		session: ClientSession,
	): Promise<ObjectId[]> {
		const starts = this.consecutiveStarts(slotStart, needed);
		const filter = {
			doctorId,
			slotStart: { $in: starts },
			slotStatus: SlotStatus.HELD,
			holdMemberId: memberId,
			holdExpiresAt: { $gt: now },
		};
		const slots = await this.slotModel.find(filter, { _id: 1 }, { session }).lean().exec();
		const result = await this.slotModel
			.updateMany(
				{ ...filter, _id: { $in: slots.map((slot) => slot._id) } },
				{ $set: { bookingId, holdExpiresAt: deadline }, $unset: { holdMemberId: 1 } },
				{ session },
			)
			.exec();
		if (slots.length !== needed || result.modifiedCount !== needed) {
			throw new BadRequestException(Messages.HOLD_EXPIRED);
		}
		return slots.map((slot) => slot._id as ObjectId);
	}

	/**
	 * After a status change. Every filter carries the booking's id: a slot that went to
	 * another patient after this request expired is never touched.
	 */
	public async applyBookingEffect(
		booking: T,
		effect: 'BOOK' | 'RELEASE' | 'KEEP',
		session: ClientSession,
	): Promise<void> {
		if (effect === 'KEEP') return;
		const filter = { _id: { $in: booking.slotIds }, bookingId: booking._id };

		if (effect === 'BOOK') {
			const result = await this.slotModel
				.updateMany(
					{ ...filter, slotStatus: SlotStatus.HELD },
					{ $set: { slotStatus: SlotStatus.BOOKED }, $unset: { holdExpiresAt: 1 } },
					{ session },
				)
				.exec();
			if (result.modifiedCount !== booking.slotIds.length) {
				throw new BadRequestException(Messages.SLOT_NOT_AVAILABLE);
			}
			return;
		}

		await this.slotModel
			.updateMany(
				filter,
				{
					$set: { slotStatus: SlotStatus.OPEN },
					$unset: { bookingId: 1, holdExpiresAt: 1, holdMemberId: 1 },
				},
				{ session },
			)
			.exec();
	}

	/** One transaction, the same shape every caller uses. */
	public async inTransaction(work: (session: ClientSession) => Promise<void>): Promise<void> {
		const session = await this.connection.startSession();
		try {
			await session.withTransaction(() => work(session));
		} finally {
			await session.endSession();
		}
	}

	/* ───────────────────────── helpers ───────────────────────── */

	private consecutiveStarts(first: Date, count: number): Date[] {
		return Array.from({ length: count }, (_, i) => new Date(first.getTime() + i * SLOT_MS));
	}

	private async ownClinic(agentId: ObjectId): Promise<T> {
		const clinic = await this.clinicService.findClinicByMember(agentId);
		if (!clinic) throw new NotFoundException(Messages.NO_DATA_FOUND);
		return clinic as T;
	}

	private toObjectId(id: string): ObjectId {
		if (!Types.ObjectId.isValid(id)) throw new NotFoundException(Messages.NO_DATA_FOUND);
		return shapeIntoMongoObjectId(id) as ObjectId;
	}
}
