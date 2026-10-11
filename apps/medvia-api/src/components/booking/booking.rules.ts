import { BadRequestException } from '@nestjs/common';
import {
	BookingActor,
	BookingConsentType,
	BookingStatus,
	BookingTab,
	SlotStatus,
} from '../../libs/enums/booking.enum';
import { Messages } from '../../libs/enums/common.enum';
import { MemberType } from '../../libs/enums/member.enum';
import { T } from '../../libs/types/common';

/**
 * The booking rules as pure functions: no database, no Nest DI, the clock passed in. The
 * services decide when to call them and write the result; these decide what is allowed.
 */

export const SLOT_MINUTES = 30;
export const HOLD_MINUTES = 10;
/** A slot must start at least this far ahead to be bookable — time for the clinic to answer. */
export const MIN_LEAD_HOURS = 3;
export const RESPOND_HOURS = 24;
/** The clinic's answer is due at least this long before the visit. */
export const RESPOND_BEFORE_VISIT_MINUTES = 60;
export const PATIENT_CANCEL_HOURS = 24;
export const MAX_PENDING_REQUESTS = 3;
export const SLOT_HORIZON_DAYS = 60;
export const SLOT_RANGE_DAYS = 31;

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
/** Asia/Seoul is UTC+9 all year — Korea has no daylight saving time, so no tz library. */
const SEOUL_OFFSET = 9 * HOUR;

/* ───────────────────────── Seoul time ───────────────────────── */

const toMinutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/** "2026-09-22" + "14:00" in Seoul → the UTC instant. */
export function seoulToUtc(date: string, minutesOrTime: number | string): Date {
	const minutes = typeof minutesOrTime === 'string' ? toMinutes(minutesOrTime) : minutesOrTime;
	return new Date(Date.parse(`${date}T00:00:00Z`) + minutes * MINUTE - SEOUL_OFFSET);
}

/** The Seoul calendar date of an instant: 2026-09-21T16:00Z is already "2026-09-22". */
export function seoulDateOf(instant: Date): string {
	return new Date(instant.getTime() + SEOUL_OFFSET).toISOString().slice(0, 10);
}

/** 0 = Sunday, as clinicHours stores it. */
export const seoulWeekday = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay();

export const addDays = (date: string, days: number) =>
	new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);

const daysBetween = (from: string, to: string) => (Date.parse(to) - Date.parse(from)) / DAY;

/** First and last instant of the Seoul month that contains `now`, as a [from, to) range. */
export function seoulMonthRange(now: Date): { from: Date; to: Date } {
	const [year, month] = seoulDateOf(now).split('-').map(Number);
	const next =
		month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, '0')}-01`;
	return {
		from: seoulToUtc(`${year}-${String(month).padStart(2, '0')}-01`, 0),
		to: seoulToUtc(next, 0),
	};
}

/* ───────────────────────── slots ───────────────────────── */

export const slotsNeeded = (treatmentDuration: number) =>
	Math.ceil(treatmentDuration / SLOT_MINUTES);

/**
 * The filter that decides "free" inside every atomic write. A hold that ran out counts as
 * free: nothing has to release it first (lazy expiry — M9's job only tidies up).
 */
export const freeSlotFilter = (now: Date): T => ({
	$or: [
		{ slotStatus: SlotStatus.OPEN },
		{ slotStatus: SlotStatus.HELD, holdExpiresAt: { $lte: now } },
	],
});

/** What the clinic and the patient see: an expired hold is shown as OPEN. */
export function effectiveSlotStatus(slot: T, now: Date): SlotStatus {
	if (slot.slotStatus === SlotStatus.HELD && slot.holdExpiresAt && slot.holdExpiresAt <= now) {
		return SlotStatus.OPEN;
	}
	return slot.slotStatus;
}

export interface SlotPlanInput {
	dateFrom: string;
	dateTo: string;
	timeFrom: string;
	timeTo: string;
	days?: number[];
}

/**
 * "Add slots": every 30-minute start inside the chosen window AND the clinic's opening hours
 * of that weekday, in the future. A closed day or a day without hours gets nothing. Opening
 * hours off the half-hour grid (09:15) start at the next grid point (09:30).
 */
export function planSlotStarts(input: SlotPlanInput, hours: T[], now: Date): Date[] {
	const today = seoulDateOf(now);
	if (
		input.dateFrom < today ||
		input.dateTo < input.dateFrom ||
		daysBetween(input.dateFrom, input.dateTo) >= SLOT_RANGE_DAYS ||
		input.dateTo > addDays(today, SLOT_HORIZON_DAYS)
	) {
		throw new BadRequestException(Messages.SLOT_RANGE_INVALID);
	}
	if (input.timeFrom >= input.timeTo) throw new BadRequestException(Messages.SLOT_TIME_INVALID);

	const starts: Date[] = [];
	for (let date = input.dateFrom; date <= input.dateTo; date = addDays(date, 1)) {
		const weekday = seoulWeekday(date);
		if (input.days?.length && !input.days.includes(weekday)) continue;
		const row = hours.find((h) => h.day === weekday);
		if (!row || row.closed || !row.open || !row.close) continue;

		const open = Math.ceil(toMinutes(row.open) / SLOT_MINUTES) * SLOT_MINUTES;
		const from = Math.max(toMinutes(input.timeFrom), open);
		const to = Math.min(toMinutes(input.timeTo), toMinutes(row.close));
		for (let m = from; m + SLOT_MINUTES <= to; m += SLOT_MINUTES) {
			const start = seoulToUtc(date, m);
			if (start > now) starts.push(start);
		}
	}
	return starts;
}

/** Each start exactly 30 minutes after the previous one. */
export function areConsecutive(starts: Date[]): boolean {
	return starts.every(
		(start, i) => i === 0 || start.getTime() - starts[i - 1].getTime() === SLOT_MINUTES * MINUTE,
	);
}

/**
 * The times a patient can pick: starts where `needed` consecutive free slots follow, no
 * earlier than `earliest`. `free` is the doctor's free slot starts of the day.
 */
export function bookableStarts(free: Date[], needed: number, earliest: Date): Date[] {
	const sorted = [...free].sort((a, b) => a.getTime() - b.getTime());
	const result: Date[] = [];
	for (let i = 0; i + needed <= sorted.length; i++) {
		if (sorted[i] < earliest) continue;
		if (areConsecutive(sorted.slice(i, i + needed))) result.push(sorted[i]);
	}
	return result;
}

export const earliestBookable = (now: Date) => new Date(now.getTime() + MIN_LEAD_HOURS * HOUR);

export const holdUntil = (now: Date) => new Date(now.getTime() + HOLD_MINUTES * MINUTE);

/** 24 hours to answer, but never later than an hour before the visit. */
export function respondDeadline(now: Date, bookingDate: Date): Date {
	return new Date(
		Math.min(
			now.getTime() + RESPOND_HOURS * HOUR,
			bookingDate.getTime() - RESPOND_BEFORE_VISIT_MINUTES * MINUTE,
		),
	);
}

/* ───────────────────────── consent ───────────────────────── */

/** The version of the text each checkbox shows. Set by the server; the client sends only `agreed`. */
export const CONSENT_VERSIONS: Record<BookingConsentType, string> = {
	[BookingConsentType.SHARE_DATA]: 'share-v1',
	[BookingConsentType.BOOKING_TERMS]: 'terms-v1',
	[BookingConsentType.AI_SUMMARY]: 'ai-summary-v1',
};

/** Whether the patient ticked an (optional) consent on this booking. */
export const hasConsent = (consents: T[], type: BookingConsentType) =>
	consents.some((c) => c.consentType === type && c.agreed);

const REQUIRED_CONSENTS = [BookingConsentType.SHARE_DATA, BookingConsentType.BOOKING_TERMS];

export function snapshotConsents(
	given: { consentType: BookingConsentType; agreed: boolean }[],
	now: Date,
): T[] {
	for (const type of REQUIRED_CONSENTS) {
		if (!given.some((c) => c.consentType === type && c.agreed)) {
			throw new BadRequestException(Messages.CONSENT_REQUIRED);
		}
	}
	return given.map((c) => ({
		consentType: c.consentType,
		agreed: c.agreed,
		version: CONSENT_VERSIONS[c.consentType],
		agreedAt: now,
	}));
}

/* ───────────────────────── status machine ───────────────────────── */

const { PATIENT, CLINIC, ADMIN } = BookingActor;

/**
 * from → to → who. Anything not in the table is refused. EXPIRED is not here: no one sets it,
 * it happens when respondDeadline passes. DECLINED, EXPIRED, CANCELLED, COMPLETED and NO_SHOW
 * are final.
 */
export const TRANSITIONS: Partial<
	Record<BookingStatus, Partial<Record<BookingStatus, BookingActor[]>>>
> = {
	[BookingStatus.PENDING]: {
		[BookingStatus.CONFIRMED]: [CLINIC],
		[BookingStatus.DECLINED]: [CLINIC],
		[BookingStatus.CANCELLED]: [PATIENT, ADMIN],
	},
	[BookingStatus.CONFIRMED]: {
		[BookingStatus.COMPLETED]: [CLINIC],
		[BookingStatus.NO_SHOW]: [CLINIC],
		[BookingStatus.CANCELLED]: [PATIENT, CLINIC, ADMIN],
	},
};

/** A doctor reads bookings but never changes them; the clinic account does. */
export function actorOf(memberType: MemberType): BookingActor | null {
	if (memberType === MemberType.USER) return PATIENT;
	if (memberType === MemberType.AGENT) return CLINIC;
	if (memberType === MemberType.ADMIN) return ADMIN;
	return null;
}

/** PENDING past its deadline is EXPIRED, whether or not the database says so yet. */
export function effectiveStatus(booking: T, now: Date): BookingStatus {
	if (booking.bookingStatus === BookingStatus.PENDING && booking.respondDeadline <= now) {
		return BookingStatus.EXPIRED;
	}
	return booking.bookingStatus;
}

export interface TransitionInput {
	from: BookingStatus;
	to: BookingStatus;
	actor: BookingActor | null;
	bookingDate: Date;
	now: Date;
	reason?: string;
}

/** Throws when the move is not allowed; otherwise returns nothing. `from` must be effective. */
export function checkTransition({
	from,
	to,
	actor,
	bookingDate,
	now,
	reason,
}: TransitionInput): void {
	if (from === BookingStatus.EXPIRED)
		throw new BadRequestException(Messages.RESPOND_DEADLINE_PASSED);
	if (!actor || !TRANSITIONS[from]?.[to]?.includes(actor)) {
		throw new BadRequestException(Messages.TRANSITION_NOT_ALLOWED);
	}

	const started = now >= bookingDate;
	if ((to === BookingStatus.COMPLETED || to === BookingStatus.NO_SHOW) && !started) {
		throw new BadRequestException(Messages.VISIT_NOT_STARTED);
	}
	if (to === BookingStatus.CANCELLED && started) {
		throw new BadRequestException(Messages.VISIT_STARTED);
	}
	if (
		to === BookingStatus.CANCELLED &&
		actor === PATIENT &&
		from === BookingStatus.CONFIRMED &&
		bookingDate.getTime() - now.getTime() < PATIENT_CANCEL_HOURS * HOUR
	) {
		throw new BadRequestException(Messages.CANCEL_TOO_LATE);
	}
	// The patient gets told why; a patient cancelling owes no one a reason.
	const needsReason =
		to === BookingStatus.DECLINED || (to === BookingStatus.CANCELLED && actor !== PATIENT);
	if (needsReason && !reason?.trim()) throw new BadRequestException(Messages.REASON_REQUIRED);
}

/** What happens to the booking's slots after a move. */
export function slotEffect(to: BookingStatus): 'BOOK' | 'RELEASE' | 'KEEP' {
	if (to === BookingStatus.CONFIRMED) return 'BOOK';
	if (
		to === BookingStatus.DECLINED ||
		to === BookingStatus.EXPIRED ||
		to === BookingStatus.CANCELLED
	) {
		return 'RELEASE';
	}
	return 'KEEP';
}

/* ───────────────────────── lists ───────────────────────── */

export interface ScopeIds {
	memberId: unknown;
	clinicId?: unknown;
	doctorId?: unknown;
}

/**
 * Which bookings a member may see, from the token — never from input. A patient asking for
 * another clinic's id still gets only their own bookings (no IDOR).
 */
export function bookingScope(memberType: MemberType, ids: ScopeIds): T {
	switch (memberType) {
		case MemberType.USER:
			return { memberId: ids.memberId };
		case MemberType.AGENT:
			return { clinicId: ids.clinicId };
		case MemberType.DOCTOR:
			return { doctorId: ids.doctorId };
		case MemberType.ADMIN:
			return {};
		default:
			throw new BadRequestException(Messages.NOT_ALLOWED_REQUEST);
	}
}

/** A status filter that agrees with effectiveStatus: PENDING past its deadline is EXPIRED. */
export function statusMatch(status: BookingStatus, now: Date): T {
	if (status === BookingStatus.PENDING) {
		return { bookingStatus: BookingStatus.PENDING, respondDeadline: { $gt: now } };
	}
	if (status === BookingStatus.EXPIRED) {
		return {
			$or: [
				{ bookingStatus: BookingStatus.EXPIRED },
				{ bookingStatus: BookingStatus.PENDING, respondDeadline: { $lte: now } },
			],
		};
	}
	return { bookingStatus: status };
}

/** The "My Bookings" tabs. */
export function tabMatch(tab: BookingTab, now: Date): T {
	if (tab === BookingTab.UPCOMING) {
		return {
			$or: [
				{ bookingStatus: BookingStatus.PENDING, respondDeadline: { $gt: now } },
				{ bookingStatus: BookingStatus.CONFIRMED, bookingDate: { $gte: now } },
			],
		};
	}
	if (tab === BookingTab.PAST) {
		return {
			$or: [
				{ bookingStatus: { $in: [BookingStatus.COMPLETED, BookingStatus.NO_SHOW] } },
				{ bookingStatus: BookingStatus.CONFIRMED, bookingDate: { $lt: now } },
			],
		};
	}
	return {
		$or: [
			{
				bookingStatus: {
					$in: [BookingStatus.CANCELLED, BookingStatus.DECLINED, BookingStatus.EXPIRED],
				},
			},
			{ bookingStatus: BookingStatus.PENDING, respondDeadline: { $lte: now } },
		],
	};
}

/** MV-2026-482913: the Seoul year and six random digits; the unique index catches a repeat. */
export function makeBookingCode(now: Date, random: () => number = Math.random): string {
	const digits = String(Math.floor(random() * 1_000_000)).padStart(6, '0');
	return `MV-${seoulDateOf(now).slice(0, 4)}-${digits}`;
}

/* ───────────────────────── the booking queue (M9) ───────────────────────── */

export const REMIND_HOURS = 24;
/** One sweep handles at most this many bookings; the next sweep takes the rest. */
export const SWEEP_BATCH = 200;

/** The reminder goes out a day before the visit. */
export const reminderAt = (bookingDate: Date) =>
	new Date(bookingDate.getTime() - REMIND_HOURS * HOUR);

/**
 * Confirmed less than a day before the visit: the confirmation itself is the reminder, and the
 * booking is marked reminded at once — "your visit is coming up" minutes later would be noise.
 */
export const confirmIsReminder = (bookingDate: Date, now: Date) => reminderAt(bookingDate) <= now;

/** PENDING past its deadline and not yet written as EXPIRED — the expiry sweep's filter. */
export const expiryDueFilter = (now: Date): T => ({
	bookingStatus: BookingStatus.PENDING,
	respondDeadline: { $lte: now },
});

/**
 * CONFIRMED, the visit within a day and still ahead, no reminder yet (`null` also matches a
 * missing field). The sweep's filter and the claim's condition at once: a booking passes it
 * only until the first worker sets bookingRemindedAt.
 */
export const reminderDueFilter = (now: Date): T => ({
	bookingStatus: BookingStatus.CONFIRMED,
	bookingRemindedAt: null,
	bookingDate: { $gt: now, $lte: new Date(now.getTime() + REMIND_HOURS * HOUR) },
});

/* ───────────────────────── admin statistics (M10) ───────────────────────── */

export const STATS_DAYS = 14;
export const LANGUAGE_DAYS = 30;

/** The UTC instant at which a Seoul calendar day begins. */
export const seoulDayStart = (date: string) => seoulToUtc(date, 0);

/** The Seoul date `n` days before `date`. */
export const seoulDaysBefore = (date: string, n: number) =>
	new Date(Date.parse(`${date}T00:00:00Z`) - n * DAY).toISOString().slice(0, 10);

/** The last `days` Seoul dates up to today, each with its count — a missing day is 0. */
export function fillDays(
	rows: { _id: string; count: number }[],
	today: string,
	days: number,
): { date: string; count: number }[] {
	const counts = new Map(rows.map((r) => [r._id, r.count]));
	return Array.from({ length: days }, (_, i) => {
		const date = seoulDaysBefore(today, days - 1 - i);
		return { date, count: counts.get(date) ?? 0 };
	});
}

/** Counts per language → shares of the total, largest first. */
export function languageShares<L extends string>(rows: { _id: L; count: number }[]) {
	const total = rows.reduce((sum, r) => sum + r.count, 0);
	return rows
		.map((r) => ({
			lang: r._id,
			count: r.count,
			share: total ? Math.round((r.count / total) * 1000) / 1000 : 0,
		}))
		.sort((a, b) => b.count - a.count);
}
