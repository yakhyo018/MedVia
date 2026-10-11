import {
	BadRequestException,
	ForbiddenException,
	Injectable,
	Logger,
	NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, ObjectId, PipelineStage, Types } from 'mongoose';
import { Booking, Bookings } from '../../libs/dto/booking/booking';
import {
	BookingCreateInput,
	BookingsInquiry,
	BookingStatusUpdate,
} from '../../libs/dto/booking/booking.input';
import { AuditAction, AuditGroup } from '../../libs/enums/admin.enum';
import {
	BookingActor,
	BookingConsentType,
	BookingStatus,
	BookingTab,
} from '../../libs/enums/booking.enum';
import { Messages } from '../../libs/enums/common.enum';
import { MemberType } from '../../libs/enums/member.enum';
import { AuthMember, T } from '../../libs/types/common';
import { shapeIntoMongoObjectId } from '../../libs/config';
import { decrypt, encrypt, parseKey } from '../../libs/utils/crypto.util';
import { ClinicService } from '../clinic/clinic.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { ChatService } from '../chat/chat.service';
import { AiService } from '../ai/ai.service';
import { NotificationService } from '../notification/notification.service';
import { seoulWhen } from '../notification/notification.rules';
import { NotificationType } from '../../libs/enums/notification.enum';
import { SlotService } from './slot.service';
import { BookingJobs } from './booking.jobs';
import {
	actorOf,
	bookingScope,
	checkTransition,
	confirmIsReminder,
	effectiveStatus,
	expiryDueFilter,
	makeBookingCode,
	MAX_PENDING_REQUESTS,
	reminderAt,
	reminderDueFilter,
	respondDeadline,
	ScopeIds,
	slotEffect,
	slotsNeeded,
	snapshotConsents,
	SWEEP_BATCH,
	hasConsent,
	statusMatch,
	tabMatch,
} from './booking.rules';

/** A random code can repeat; the unique index refuses it and the request is tried again. */
const CODE_ATTEMPTS = 3;

/** The cards next to a booking. The treatment's draft and review note stay with the clinic. */
const lookupCards: PipelineStage.FacetPipelineStage[] = [
	{
		$lookup: { from: 'clinics', localField: 'clinicId', foreignField: '_id', as: 'clinicData' },
	},
	{ $unwind: { path: '$clinicData', preserveNullAndEmptyArrays: true } },
	{
		$lookup: { from: 'doctors', localField: 'doctorId', foreignField: '_id', as: 'doctorData' },
	},
	{ $unwind: { path: '$doctorData', preserveNullAndEmptyArrays: true } },
	{
		$lookup: {
			from: 'treatments',
			localField: 'treatmentId',
			foreignField: '_id',
			pipeline: [{ $project: { treatmentDraft: 0, treatmentReviewNote: 0 } }],
			as: 'treatmentData',
		},
	},
	{ $unwind: { path: '$treatmentData', preserveNullAndEmptyArrays: true } },
	{
		$lookup: {
			from: 'members',
			localField: 'memberId',
			foreignField: '_id',
			pipeline: [{ $project: { memberFullName: 1 } }],
			as: 'patient',
		},
	},
	{ $addFields: { patientName: { $first: '$patient.memberFullName' } } },
	{ $project: { patient: 0 } },
];

@Injectable()
export class BookingService {
	private readonly logger = new Logger(BookingService.name);

	/** Read once at boot; env validation has already refused a key that is not 32 bytes. */
	private readonly key = parseKey(process.env.MEDICAL_ENC_KEY);

	constructor(
		@InjectModel('Booking') private readonly bookingModel: Model<T>,
		@InjectModel('Doctor') private readonly doctorModel: Model<T>,
		@InjectModel('Treatment') private readonly treatmentModel: Model<T>,
		@InjectModel('Member') private readonly memberModel: Model<T>,
		private readonly slotService: SlotService,
		private readonly clinicService: ClinicService,
		private readonly auditLogService: AuditLogService,
		private readonly chatService: ChatService,
		private readonly aiService: AiService,
		private readonly notificationService: NotificationService,
		private readonly jobs: BookingJobs,
	) {}

	/* ───────────────────────── patient ───────────────────────── */

	/**
	 * "Send booking request" (step 4). Everything is checked again — the treatment may have
	 * been hidden during the 10 minutes — then, in one transaction, the patient's hold becomes
	 * the booking's hold and the booking is written. The price is copied here.
	 */
	public async createBooking(memberId: ObjectId, input: BookingCreateInput): Promise<Booking> {
		const { treatment, clinic, doctor } = await this.slotService.findBookable(
			input.treatmentId,
			input.doctorId,
		);
		this.checkLanguages(clinic, input.bookingLang, input.bookingInterpreter);

		const now = new Date();
		const bookingConsents = snapshotConsents(input.consents, now);
		const waiting = await this.bookingModel
			.countDocuments({ memberId, ...statusMatch(BookingStatus.PENDING, now) })
			.exec();
		if (waiting >= MAX_PENDING_REQUESTS) throw new BadRequestException(Messages.TOO_MANY_REQUESTS);

		const deadline = respondDeadline(now, input.slotStart);
		if (deadline <= now) throw new BadRequestException(Messages.SLOT_TOO_SOON);

		const base = {
			bookingStatus: BookingStatus.PENDING,
			bookingDate: input.slotStart,
			bookingPrice: treatment.treatmentPrice,
			bookingLang: input.bookingLang,
			bookingInterpreter: input.bookingInterpreter,
			bookingQuestionnaire: {
				answersEnc: encrypt(JSON.stringify(input.questionnaire.answers), this.key),
				originalLang: input.questionnaire.originalLang,
			},
			bookingConsents,
			bookingHistory: [{ status: BookingStatus.PENDING, changedBy: memberId, changedAt: now }],
			respondDeadline: deadline,
			memberId,
			clinicId: clinic._id,
			doctorId: doctor._id,
			treatmentId: treatment._id,
		};

		for (let attempt = 1; ; attempt++) {
			const _id = new Types.ObjectId();
			let created!: T;
			try {
				await this.slotService.inTransaction(async (session) => {
					const slotIds = await this.slotService.attachHeldSlots(
						memberId,
						doctor._id,
						input.slotStart,
						slotsNeeded(treatment.treatmentDuration),
						_id,
						deadline,
						now,
						session,
					);
					const [doc] = await this.bookingModel.create(
						[{ ...base, _id, slotIds, bookingCode: makeBookingCode(now) }],
						{ session },
					);
					created = doc.toObject();
				});
			} catch (err) {
				if ((err as T)?.code === 11000 && attempt < CODE_ATTEMPTS) continue;
				throw err;
			}
			// The request opens the patient's room with the clinic and says so in it.
			await this.chatService.postBookingLine(
				created,
				BookingStatus.PENDING,
				BookingActor.PATIENT,
				treatment.treatmentName,
			);
			await this.notifyBooking(
				created,
				BookingStatus.PENDING,
				BookingActor.PATIENT,
				treatment.treatmentName,
			);
			// The clinic has until respondDeadline; the job expires the request at that moment.
			this.jobs.scheduleExpiry(created._id, deadline);
			// Only with the optional AI_SUMMARY consent; not awaited — the patient does not wait for AI.
			if (hasConsent(bookingConsents, BookingConsentType.AI_SUMMARY)) {
				void this.writeAiSummary(created._id, input.questionnaire.answers);
			}
			return { ...created, bookingQuestionnaire: input.questionnaire } as unknown as Booking;
		}
	}

	/* ───────────────────────── every role ───────────────────────── */

	/**
	 * One booking with its cards. The questionnaire is decrypted for the patient, the clinic
	 * and the doctor of this booking — the scope already guarantees it is theirs. The admin
	 * handles bookings, not medical data, and never receives it.
	 */
	public async getBooking(authMember: AuthMember, bookingId: string): Promise<Booking> {
		const scope = await this.scopeOf(authMember);
		const [booking] = await this.bookingModel
			.aggregate([{ $match: { _id: this.toObjectId(bookingId), ...scope } }, ...lookupCards])
			.exec();
		if (!booking) throw new NotFoundException(Messages.NO_DATA_FOUND);

		const withAnswers = authMember.memberType !== MemberType.ADMIN;
		return this.present(booking, new Date(), withAnswers);
	}

	/**
	 * "My Bookings", the clinic's list, the doctor's list and the admin's list in one query.
	 * The scope comes from the token; tab, status, doctor and clinic only narrow it further,
	 * so a patient passing another clinic's id still sees nothing but their own bookings.
	 */
	public async getBookings(authMember: AuthMember, input: BookingsInquiry): Promise<Bookings> {
		const now = new Date();
		const and: T[] = [await this.scopeOf(authMember)];
		if (input.tab) and.push(tabMatch(input.tab, now));
		if (input.bookingStatus) and.push(statusMatch(input.bookingStatus, now));
		if (input.doctorId) and.push({ doctorId: this.toObjectId(input.doctorId) });
		if (input.clinicId) and.push({ clinicId: this.toObjectId(input.clinicId) });

		// Upcoming reads soonest first; every other list newest first.
		const direction = input.tab === BookingTab.UPCOMING ? 1 : -1;
		const [result] = await this.bookingModel
			.aggregate([
				{ $match: { $and: and } },
				{ $sort: { bookingDate: direction, _id: direction } },
				{
					$facet: {
						list: [
							{ $skip: (input.page - 1) * input.limit },
							{ $limit: input.limit },
							{ $project: { bookingQuestionnaire: 0, bookingAiSummaryEnc: 0 } },
							...lookupCards,
						],
						metaCounter: [{ $count: 'total' }],
					},
				},
			])
			.exec();
		return {
			list: result.list.map((booking: T) => this.present(booking, now, false)),
			metaCounter: result.metaCounter,
		};
	}

	/**
	 * Confirm, decline, complete, no-show and cancel through one door. The role comes from the
	 * token, the allowed moves from TRANSITIONS. The write is conditional on the status that
	 * was read, so two clicks — or a clinic confirming while the patient cancels — cannot both
	 * win. The booking and its slots change in one transaction.
	 */
	public async updateBookingStatus(
		authMember: AuthMember,
		input: BookingStatusUpdate,
	): Promise<Booking> {
		const actor = actorOf(authMember.memberType);
		if (!actor) throw new ForbiddenException(Messages.ONLY_SPECIFIC_ROLES_ALLOWED);

		const scope = await this.scopeOf(authMember);
		const booking = await this.bookingModel
			.findOne({ _id: this.toObjectId(input.bookingId), ...scope })
			.lean()
			.exec();
		if (!booking) throw new NotFoundException(Messages.NO_DATA_FOUND);

		const now = new Date();
		const from = effectiveStatus(booking, now);
		// The deadline passed and nothing wrote it yet: write it now, then refuse.
		if (from === BookingStatus.EXPIRED && booking.bookingStatus === BookingStatus.PENDING) {
			await this.expire(booking, now);
		}

		const to = input.bookingStatus;
		const reason = input.reason?.trim();
		checkTransition({ from, to, actor, bookingDate: booking.bookingDate, now, reason });

		const set: T = { bookingStatus: to };
		if (to === BookingStatus.DECLINED) set.bookingDeclineReason = reason;
		if (to === BookingStatus.CANCELLED) set.cancelledBy = actor;
		if (to === BookingStatus.COMPLETED) set.completedAt = now;
		if (to === BookingStatus.CONFIRMED && confirmIsReminder(booking.bookingDate, now)) {
			set.bookingRemindedAt = now;
		}

		const filter: T = { _id: booking._id, bookingStatus: booking.bookingStatus };
		if (booking.bookingStatus === BookingStatus.PENDING) filter.respondDeadline = { $gt: now };

		let updated: T | null = null;
		await this.slotService.inTransaction(async (session) => {
			updated = await this.bookingModel
				.findOneAndUpdate(
					filter,
					{
						$set: set,
						$push: {
							bookingHistory: { status: to, changedBy: authMember._id, reason, changedAt: now },
						},
					},
					{ new: true, session },
				)
				.lean()
				.exec();
			if (!updated) throw new BadRequestException(Messages.WRONG_STATUS);
			await this.slotService.applyBookingEffect(updated, slotEffect(to), session);
		});

		const treatment = await this.treatmentModel
			.findById(booking.treatmentId, { treatmentName: 1 })
			.lean()
			.exec();
		await this.chatService.postBookingLine(
			updated as unknown as T,
			to,
			actor,
			treatment?.treatmentName ?? '',
			reason,
		);
		await this.notifyBooking(
			updated as unknown as T,
			to,
			actor,
			treatment?.treatmentName ?? '',
			reason,
		);
		if (to === BookingStatus.CONFIRMED && !set.bookingRemindedAt) {
			this.jobs.scheduleReminder(booking._id, reminderAt(booking.bookingDate));
		}

		if (actor === BookingActor.ADMIN) {
			await this.auditLogService.record({
				auditAction: AuditAction.BOOKING_CANCEL,
				auditGroup: AuditGroup.BOOKING,
				auditRefId: booking._id as ObjectId,
				auditNote: reason,
				memberId: authMember._id,
			});
		}
		return this.present(updated as unknown as T, now, false);
	}

	/* ───────────────────────── called by other modules ───────────────────────── */

	/**
	 * removeDoctor refuses while a request waits or a confirmed visit is ahead. Scoped to the
	 * clinic: another clinic's doctor id answers "no", never a hint about foreign bookings.
	 */
	public async hasUpcomingBookings(clinicId: unknown, doctorId: unknown): Promise<boolean> {
		const now = new Date();
		return !!(await this.bookingModel
			.exists({ clinicId, doctorId, ...tabMatch(BookingTab.UPCOMING, now) })
			.exec());
	}

	/** The review module: one booking of this patient — another patient's id is "not found". */
	public async findOwnBooking(memberId: ObjectId, bookingId: string): Promise<T> {
		const booking = await this.bookingModel
			.findOne({ _id: this.toObjectId(bookingId), memberId })
			.lean()
			.exec();
		if (!booking) throw new NotFoundException(Messages.NO_DATA_FOUND);
		return booking;
	}

	/**
	 * Inside the review's transaction. Conditional, so two "Publish" clicks cannot both pass:
	 * the second finds the flag already set. Never reset — a deleted review is final.
	 */
	public async markReviewed(bookingId: unknown, session: ClientSession): Promise<void> {
		const result = await this.bookingModel
			.updateOne(
				{ _id: bookingId, bookingStatus: BookingStatus.COMPLETED, bookingReviewed: { $ne: true } },
				{ $set: { bookingReviewed: true } },
				{ session },
			)
			.exec();
		if (result.modifiedCount !== 1) throw new BadRequestException(Messages.ALREADY_REVIEWED);
	}

	/* ───────────────────────── the booking queue ───────────────────────── */

	/**
	 * PENDING past its deadline → EXPIRED, the slots released, the patient told. One booking
	 * (its delayed job) or a page of them (the sweep). Each expiry is a conditional write, so the
	 * job, the sweep and a lazy expiry racing for one booking expire it — and notify — once.
	 */
	public async expireDue(bookingId?: string): Promise<number> {
		const now = new Date();
		const due = await this.bookingModel
			.find({ ...expiryDueFilter(now), ...this.onlyOne(bookingId) })
			.limit(SWEEP_BATCH)
			.lean()
			.exec();
		let expired = 0;
		for (const booking of due) if (await this.expire(booking, now)) expired++;
		return expired;
	}

	/**
	 * "Your visit is coming up", a day before. Claimed first — bookingRemindedAt is set by a
	 * conditional update — then sent: two workers never both send it. The price is at most once:
	 * a crash between the claim and the notification loses this reminder.
	 */
	public async remindDue(bookingId?: string): Promise<number> {
		const now = new Date();
		const due = await this.bookingModel
			.find({ ...reminderDueFilter(now), ...this.onlyOne(bookingId) }, { _id: 1 })
			.limit(SWEEP_BATCH)
			.lean()
			.exec();
		let reminded = 0;
		for (const { _id } of due) {
			const claimed = await this.bookingModel
				.findOneAndUpdate(
					{ _id, ...reminderDueFilter(now) },
					{ $set: { bookingRemindedAt: now } },
					{ new: true },
				)
				.lean()
				.exec();
			if (!claimed) continue;
			const { params } = await this.paramsOf(claimed, await this.treatmentNameOf(claimed));
			await this.notificationService.notify({
				type: NotificationType.VISIT_REMINDER,
				receiverId: claimed.memberId,
				refId: claimed._id,
				params,
			});
			reminded++;
		}
		return reminded;
	}

	/* ───────────────────────── helpers ───────────────────────── */

	/**
	 * The bell for a booking event, after it committed. A request is news for the clinic; a
	 * confirm, decline, expiry or "how was your visit?" for the patient; a cancel for whoever
	 * did not cancel (an admin's cancel for both). NotificationService never throws.
	 */
	private async notifyBooking(
		booking: T,
		status: BookingStatus,
		actor: BookingActor | null,
		treatmentName: string,
		reason?: string,
	): Promise<void> {
		const { clinic, params } = await this.paramsOf(booking, treatmentName, reason);
		const toPatient = (type: NotificationType) =>
			this.notificationService.notify({
				type,
				receiverId: booking.memberId,
				refId: booking._id,
				params,
			});
		const toClinic = async (type: NotificationType) => {
			const patient = await this.memberModel
				.findById(booking.memberId, { memberFullName: 1 })
				.lean()
				.exec();
			await this.notificationService.notify({
				type,
				receiverId: clinic?.memberId,
				refId: booking._id,
				authorId: booking.memberId,
				params: { ...params, patientName: patient?.memberFullName ?? '' },
			});
		};

		if (status === BookingStatus.PENDING) return await toClinic(NotificationType.BOOKING_REQUESTED);
		if (status === BookingStatus.CONFIRMED)
			return await toPatient(NotificationType.BOOKING_CONFIRMED);
		if (status === BookingStatus.DECLINED)
			return await toPatient(NotificationType.BOOKING_DECLINED);
		if (status === BookingStatus.COMPLETED) return await toPatient(NotificationType.REVIEW_REQUEST);
		if (status === BookingStatus.EXPIRED) return await toPatient(NotificationType.BOOKING_EXPIRED);
		if (status === BookingStatus.CANCELLED) {
			if (actor !== BookingActor.PATIENT) await toPatient(NotificationType.BOOKING_CANCELLED);
			if (actor !== BookingActor.CLINIC) await toClinic(NotificationType.BOOKING_CANCELLED);
		}
	}

	/** The pieces of a booking's notification text. */
	private async paramsOf(booking: T, treatmentName: string, reason?: string) {
		const clinic = await this.clinicService.findClinicCard(booking.clinicId);
		const params: T = {
			clinicName: clinic?.clinicName ?? '',
			treatmentName,
			when: seoulWhen(booking.bookingDate),
			reason,
		};
		return { clinic, params };
	}

	private async treatmentNameOf(booking: T): Promise<string> {
		const treatment = await this.treatmentModel
			.findById(booking.treatmentId, { treatmentName: 1 })
			.lean()
			.exec();
		return treatment?.treatmentName ?? '';
	}

	/** A job names its booking; a sweep does not. */
	private onlyOne(bookingId?: string): T {
		return bookingId ? { _id: this.toObjectId(bookingId) } : {};
	}

	/**
	 * PENDING past its deadline becomes EXPIRED and lets go of its slots; the patient is told.
	 * Called lazily (a status change on an expired request), by the job and by the sweep —
	 * whichever writes first. Returns whether this call was the one that expired it.
	 */
	private async expire(booking: T, now: Date): Promise<boolean> {
		let expired: T | null = null;
		await this.slotService.inTransaction(async (session) => {
			expired = await this.bookingModel
				.findOneAndUpdate(
					{
						_id: booking._id,
						bookingStatus: BookingStatus.PENDING,
						respondDeadline: { $lte: now },
					},
					{
						$set: { bookingStatus: BookingStatus.EXPIRED },
						$push: {
							bookingHistory: {
								status: BookingStatus.EXPIRED,
								reason: 'The clinic did not answer before the deadline',
								changedAt: booking.respondDeadline,
							},
						},
					},
					{ new: true, session },
				)
				.lean()
				.exec();
			if (expired) await this.slotService.applyBookingEffect(expired, 'RELEASE', session);
		});
		if (!expired) return false;
		const done = expired as T;
		await this.notifyBooking(done, BookingStatus.EXPIRED, null, await this.treatmentNameOf(done));
		return true;
	}

	/** The token's member → the filter of the bookings they may see. */
	private async scopeOf(authMember: AuthMember): Promise<T> {
		const ids: ScopeIds = { memberId: authMember._id };
		if (authMember.memberType === MemberType.AGENT) {
			const clinic = await this.clinicService.findClinicByMember(authMember._id);
			if (!clinic) throw new NotFoundException(Messages.NO_DATA_FOUND);
			ids.clinicId = clinic._id;
		}
		if (authMember.memberType === MemberType.DOCTOR) {
			const doctor = await this.doctorModel
				.findOne({ memberId: authMember._id }, { _id: 1 })
				.lean()
				.exec();
			if (!doctor) throw new NotFoundException(Messages.NO_DATA_FOUND);
			ids.doctorId = doctor._id;
		}
		return bookingScope(authMember.memberType, ids);
	}

	/** Effective status on the way out; answers decrypted only when asked for. */
	private present(booking: T, now: Date, withAnswers: boolean): Booking {
		const { bookingQuestionnaire, bookingAiSummaryEnc, ...rest } = booking;
		const result: T = { ...rest, bookingStatus: effectiveStatus(booking, now) };
		if (withAnswers && bookingQuestionnaire) {
			result.bookingQuestionnaire = {
				answers: JSON.parse(decrypt(bookingQuestionnaire.answersEnc, this.key)),
				originalLang: bookingQuestionnaire.originalLang,
			};
		}
		if (withAnswers && bookingAiSummaryEnc) {
			result.bookingAiSummary = decrypt(bookingAiSummaryEnc, this.key);
		}
		return result as Booking;
	}

	/**
	 * The Korean summary for the doctor, written after the request was sent. Only the answers go
	 * to the AI — no name, no contact (pseudonymised). Stored encrypted like the answers. A
	 * failure leaves no summary; the doctor still has the original answers.
	 */
	private async writeAiSummary(
		bookingId: unknown,
		answers: { question: string; answer: string }[],
	) {
		try {
			const summary = await this.aiService.summarize(answers);
			if (!summary) return;
			await this.bookingModel
				.updateOne(
					{ _id: bookingId },
					{ $set: { bookingAiSummaryEnc: encrypt(summary, this.key) } },
				)
				.exec();
		} catch (err: any) {
			this.logger.warn(`AI summary of ${String(bookingId)} not stored: ${err.message}`);
		}
	}

	/**
	 * The patient speaks bookingLang at the visit: the clinic must speak it at reception, or
	 * offer an interpreter in exactly that language.
	 */
	private checkLanguages(clinic: T, lang: string, interpreter?: string): void {
		const reception: string[] = clinic.clinicLangs ?? [];
		const interpreters: string[] = clinic.clinicInterpreterLangs ?? [];
		if (interpreter && !interpreters.includes(interpreter)) {
			throw new BadRequestException(Messages.LANGUAGE_NOT_OFFERED);
		}
		if (!reception.includes(lang) && interpreter !== lang) {
			throw new BadRequestException(Messages.LANGUAGE_NOT_OFFERED);
		}
	}

	private toObjectId(id: string): ObjectId {
		if (!Types.ObjectId.isValid(id)) throw new NotFoundException(Messages.NO_DATA_FOUND);
		return shapeIntoMongoObjectId(id) as ObjectId;
	}
}
