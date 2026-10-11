import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Messages } from '../../libs/enums/common.enum';
import { BookingTab } from '../../libs/enums/booking.enum';
import { AuthMember, T } from '../../libs/types/common';
import { ClinicService } from '../clinic/clinic.service';
import { TreatmentService } from '../treatment/treatment.service';
import { SlotService } from '../booking/slot.service';
import { BookingService } from '../booking/booking.service';
import { ReviewService } from '../review/review.service';
import { seoulDateOf } from '../booking/booking.rules';
import { PROPOSAL_MINUTES, slotLabel, untrusted } from './assistant.rules';
export { TOOL_BY_NAME, TOOL_SPECS } from './assistant.tool-specs';

const DAY = 24 * 60 * 60_000;
const MAX_SLOTS = 8;

/** What one tool hands back: JSON for the model, and the cards the app shows the patient. */
export interface ToolOutcome {
	content: T;
	clinics?: T[];
	slots?: T[];
	proposal?: T;
}

/**
 * The handlers: each calls the service the app itself uses, with the patient's own identity,
 * so every rule (live clinics only, free slots only, one's own bookings only) still applies.
 * What goes back to the model is compact — ids, names, prices, labels — and anything written by
 * other people is wrapped as <data>.
 */
@Injectable()
export class AssistantTools {
	constructor(
		@InjectModel('Treatment') private readonly treatmentModel: Model<T>,
		private readonly clinicService: ClinicService,
		private readonly treatmentService: TreatmentService,
		private readonly slotService: SlotService,
		private readonly bookingService: BookingService,
		private readonly reviewService: ReviewService,
	) {}

	public async run(name: string, args: T, member: AuthMember, now: Date): Promise<ToolOutcome> {
		switch (name) {
			case 'search_clinics':
				return await this.searchClinics(args, member);
			case 'find_slots':
				return await this.findSlots(args, now);
			case 'get_reviews':
				return await this.getReviews(args);
			case 'my_bookings':
				return await this.myBookings(member);
			case 'propose_hold':
				return await this.proposeHold(args, now);
			default:
				throw new Error(`unknown tool ${name}`);
		}
	}

	private async searchClinics(args: T, member: AuthMember): Promise<ToolOutcome> {
		const page = await this.clinicService.getClinics(member, {
			page: 1,
			limit: 3,
			sort: 'clinicScore',
			search: {
				text: args.text,
				specialty: args.specialty,
				districts: args.district ? [args.district] : undefined,
				langs: args.language ? [args.language] : undefined,
				interpreter: args.interpreter,
				priceMax: args.priceMax,
			},
		} as never);
		const clinics = await Promise.all(
			(page.list ?? []).map(async (clinic: T) => {
				const treatments = await this.treatmentService.getClinicTreatments({
					clinicId: String(clinic._id),
				} as never);
				const wanted = args.text?.toLowerCase();
				const matching = wanted
					? treatments.filter((t: T) => t.treatmentName.toLowerCase().includes(wanted))
					: [];
				return {
					clinicId: String(clinic._id),
					clinicName: clinic.clinicName,
					district: clinic.clinicDistrict,
					rating: clinic.clinicRating,
					reviews: clinic.clinicReviews,
					minPriceKrw: clinic.clinicMinPrice,
					languages: clinic.clinicLangs,
					interpreterLanguages: clinic.clinicInterpreterLangs,
					about: untrusted(clinic.clinicDesc, 150),
					treatments: (matching.length ? matching : treatments).slice(0, 3).map((t: T) => ({
						treatmentId: String(t._id),
						name: t.treatmentName,
						priceKrw: t.treatmentPrice,
						minutes: t.treatmentDuration,
					})),
				};
			}),
		);
		return {
			content: { clinics },
			clinics: clinics.map((c) => ({
				clinicId: c.clinicId,
				clinicName: c.clinicName,
				district: c.district,
				rating: c.rating,
				minPriceKrw: c.minPriceKrw,
			})),
		};
	}

	/** Each day of the window, each doctor of the treatment; the earliest eight overall. */
	private async findSlots(args: T, now: Date): Promise<ToolOutcome> {
		const treatment = await this.treatmentModel
			.findById(args.treatmentId, { doctorIds: 1 })
			.lean()
			.exec();
		if (!treatment) throw new NotFoundException(Messages.NO_DATA_FOUND);
		const doctorIds: string[] = args.doctorId ? [args.doctorId] : treatment.doctorIds.map(String);
		const first = args.dateFrom ?? seoulDateOf(new Date(now.getTime() + DAY));
		const days = Array.from({ length: args.days ?? 7 }, (_, i) =>
			seoulDateOf(new Date(Date.parse(`${first}T03:00:00Z`) + i * DAY)),
		);

		const found: T[] = [];
		for (const doctorId of doctorIds) {
			// Also the check that this doctor performs this treatment and both are live.
			const bookable = await this.slotService
				.findBookable(args.treatmentId, doctorId)
				.catch(() => null);
			if (!bookable) continue;
			const doctorName = `Dr. ${bookable.doctor.doctorName}`;
			for (const date of days) {
				const starts = await this.slotService
					.getAvailableSlots({ treatmentId: args.treatmentId, doctorId, date })
					.catch(() => [] as Date[]);
				for (const start of starts)
					found.push({ treatmentId: args.treatmentId, doctorId, doctorName, start });
			}
		}
		const slots = found
			.sort((a, b) => a.start.getTime() - b.start.getTime())
			.slice(0, MAX_SLOTS)
			.map((s) => ({
				treatmentId: s.treatmentId,
				doctorId: s.doctorId,
				slotStart: s.start.toISOString(),
				label: `${slotLabel(s.start)} · ${s.doctorName}`,
			}));
		return {
			content: { slots },
			slots: slots.map((s) => ({ ...s, slotStart: new Date(s.slotStart) })),
		};
	}

	private async getReviews(args: T): Promise<ToolOutcome> {
		const page = await this.reviewService.getReviews({
			page: 1,
			limit: 3,
			clinicId: args.clinicId,
		} as never);
		return {
			content: {
				reviews: (page.list ?? []).map((r: T) => ({
					rating: r.reviewRating,
					tags: r.reviewTags,
					text: untrusted(r.reviewContent, 200),
				})),
			},
		};
	}

	private async myBookings(member: AuthMember): Promise<ToolOutcome> {
		const page = await this.bookingService.getBookings(member, {
			page: 1,
			limit: 5,
			tab: BookingTab.UPCOMING,
		} as never);
		return {
			content: {
				bookings: (page.list ?? []).map((b: T) => ({
					bookingCode: b.bookingCode,
					status: b.bookingStatus,
					when: slotLabel(new Date(b.bookingDate)),
					clinicName: b.clinicData?.clinicName,
					treatmentName: b.treatmentData?.treatmentName,
				})),
			},
		};
	}

	/**
	 * Checked like a real hold would be — the treatment is live, the doctor performs it, the time
	 * is free and far enough ahead — but nothing is written to the slots. The proposal is stored on
	 * the session by the caller and waits for the patient's Confirm.
	 */
	private async proposeHold(args: T, now: Date): Promise<ToolOutcome> {
		const slotStart = new Date(args.slotStart);
		if (Number.isNaN(slotStart.getTime())) throw new Error('slotStart is not a date');
		const { treatment, doctor } = await this.slotService.findBookable(
			args.treatmentId,
			args.doctorId,
		);
		const free = await this.slotService.getAvailableSlots({
			treatmentId: args.treatmentId,
			doctorId: args.doctorId,
			date: seoulDateOf(slotStart),
		});
		if (!free.some((s) => s.getTime() === slotStart.getTime())) {
			throw new Error('this time is not free (use a slot exactly as find_slots returned it)');
		}
		const clinic = await this.clinicService.findClinicCard(treatment.clinicId);
		const proposal = {
			treatmentId: new Types.ObjectId(String(treatment._id)),
			doctorId: new Types.ObjectId(String(doctor._id)),
			slotStart,
			label: `${slotLabel(slotStart)} · Dr. ${doctor.doctorName}`,
			clinicName: clinic?.clinicName,
			treatmentName: treatment.treatmentName,
			priceKrw: treatment.treatmentPrice,
			expiresAt: new Date(now.getTime() + PROPOSAL_MINUTES * 60_000),
		};
		return {
			content: {
				proposed: true,
				label: proposal.label,
				clinicName: proposal.clinicName,
				treatmentName: proposal.treatmentName,
				priceKrw: proposal.priceKrw,
				note: 'Not held yet: the patient must press Confirm in the app.',
			},
			proposal,
		};
	}
}
