import {
	BookingActor,
	BookingConsentType,
	BookingStatus,
	SlotStatus,
} from '../../libs/enums/booking.enum';
import { Messages } from '../../libs/enums/common.enum';
import { MemberType } from '../../libs/enums/member.enum';
import {
	actorOf,
	areConsecutive,
	bookableStarts,
	bookingScope,
	checkTransition,
	effectiveSlotStatus,
	effectiveStatus,
	makeBookingCode,
	planSlotStarts,
	respondDeadline,
	seoulDateOf,
	seoulMonthRange,
	seoulToUtc,
	slotEffect,
	slotsNeeded,
	snapshotConsents,
	statusMatch,
	TRANSITIONS,
} from './booking.rules';

// Monday 21 Sep 2026, 10:00 in Seoul.
const NOW = new Date('2026-09-21T01:00:00Z');
const at = (iso: string) => new Date(iso);

/** Mon–Fri 10:00–19:00, Sat 10:00–14:00, Sun closed. */
const HOURS = [
	{ day: 0, closed: true },
	...[1, 2, 3, 4, 5].map((day) => ({ day, open: '10:00', close: '19:00', closed: false })),
	{ day: 6, open: '10:00', close: '14:00', closed: false },
];

describe('Seoul time', () => {
	it('turns a Seoul wall-clock time into UTC (UTC+9)', () => {
		expect(seoulToUtc('2026-09-22', '14:00')).toEqual(at('2026-09-22T05:00:00Z'));
	});

	it('crosses the date line: 08:00 Seoul is the previous day in UTC', () => {
		expect(seoulToUtc('2026-09-22', '08:00')).toEqual(at('2026-09-21T23:00:00Z'));
	});

	it('reads the Seoul date of a UTC instant', () => {
		expect(seoulDateOf(at('2026-09-21T16:00:00Z'))).toBe('2026-09-22');
		expect(seoulDateOf(at('2026-09-21T14:59:00Z'))).toBe('2026-09-21');
	});

	it('gives the Seoul month as a [from, to) range, also across a year end', () => {
		expect(seoulMonthRange(NOW)).toEqual({
			from: at('2026-08-31T15:00:00Z'),
			to: at('2026-09-30T15:00:00Z'),
		});
		expect(seoulMonthRange(at('2026-12-15T00:00:00Z')).to).toEqual(at('2026-12-31T15:00:00Z'));
	});
});

describe('slotsNeeded', () => {
	it.each([
		[10, 1],
		[30, 1],
		[31, 2],
		[60, 2],
		[90, 3],
		[240, 8],
	])('%i minutes → %i slots', (minutes, slots) => {
		expect(slotsNeeded(minutes)).toBe(slots);
	});
});

describe('planSlotStarts', () => {
	const plan = (extra: object, hours = HOURS) =>
		planSlotStarts(
			{
				dateFrom: '2026-09-22',
				dateTo: '2026-09-22',
				timeFrom: '10:00',
				timeTo: '12:00',
				...extra,
			},
			hours,
			NOW,
		);

	it('creates a slot every 30 minutes inside the window', () => {
		expect(plan({})).toEqual([
			seoulToUtc('2026-09-22', '10:00'),
			seoulToUtc('2026-09-22', '10:30'),
			seoulToUtc('2026-09-22', '11:00'),
			seoulToUtc('2026-09-22', '11:30'),
		]);
	});

	it('cuts the window to the opening hours', () => {
		// Saturday 26 Sep closes at 14:00.
		const starts = plan({
			dateFrom: '2026-09-26',
			dateTo: '2026-09-26',
			timeFrom: '13:00',
			timeTo: '18:00',
		});
		expect(starts).toEqual([seoulToUtc('2026-09-26', '13:00'), seoulToUtc('2026-09-26', '13:30')]);
	});

	it('skips a closed day and a day without hours', () => {
		expect(plan({ dateFrom: '2026-09-27', dateTo: '2026-09-27' })).toEqual([]); // Sunday
		expect(
			plan(
				{},
				HOURS.filter((h) => h.day !== 2),
			),
		).toEqual([]); // no Tuesday row
	});

	it('keeps only the chosen weekdays', () => {
		const starts = plan({
			dateFrom: '2026-09-22',
			dateTo: '2026-09-25',
			timeTo: '10:30',
			days: [3, 5],
		});
		expect(starts).toEqual([seoulToUtc('2026-09-23', '10:00'), seoulToUtc('2026-09-25', '10:00')]);
	});

	it('starts at the next half hour when the clinic opens off the grid', () => {
		const hours = [{ day: 2, open: '09:15', close: '11:00', closed: false }];
		expect(plan({ timeFrom: '09:00' }, hours)).toEqual([
			seoulToUtc('2026-09-22', '09:30'),
			seoulToUtc('2026-09-22', '10:00'),
			seoulToUtc('2026-09-22', '10:30'),
		]);
	});

	it('never creates a slot in the past', () => {
		// Today, 10:00 Seoul: the 10:00 slot has started, 10:30 has not.
		const starts = plan({ dateFrom: '2026-09-21', dateTo: '2026-09-21', timeTo: '11:00' });
		expect(starts).toEqual([seoulToUtc('2026-09-21', '10:30')]);
	});

	it.each([
		['before today', { dateFrom: '2026-09-20' }],
		['end before start', { dateTo: '2026-09-21' }],
		['more than 31 days', { dateTo: '2026-10-23' }],
		['beyond 60 days', { dateFrom: '2026-11-19', dateTo: '2026-11-21' }],
	])('refuses a range %s', (_name, extra) => {
		expect(() => plan(extra)).toThrow(Messages.SLOT_RANGE_INVALID);
	});

	it('refuses a window that ends before it starts', () => {
		expect(() => plan({ timeFrom: '12:00', timeTo: '12:00' })).toThrow(Messages.SLOT_TIME_INVALID);
	});
});

describe('free slots and bookable times', () => {
	const s = (time: string) => seoulToUtc('2026-09-22', time);

	it('counts an expired hold as OPEN, a live one as HELD', () => {
		const expired = { slotStatus: SlotStatus.HELD, holdExpiresAt: at('2026-09-21T00:59:00Z') };
		const live = { slotStatus: SlotStatus.HELD, holdExpiresAt: at('2026-09-21T01:05:00Z') };
		expect(effectiveSlotStatus(expired, NOW)).toBe(SlotStatus.OPEN);
		expect(effectiveSlotStatus(live, NOW)).toBe(SlotStatus.HELD);
		expect(effectiveSlotStatus({ slotStatus: SlotStatus.BOOKED }, NOW)).toBe(SlotStatus.BOOKED);
	});

	it('knows consecutive slots', () => {
		expect(areConsecutive([s('10:00'), s('10:30'), s('11:00')])).toBe(true);
		expect(areConsecutive([s('10:00'), s('11:00')])).toBe(false);
	});

	it('offers a 60-minute treatment only where two free slots follow each other', () => {
		const free = [s('11:00'), s('10:00'), s('10:30'), s('14:00'), s('15:00'), s('15:30')];
		expect(bookableStarts(free, 2, NOW)).toEqual([s('10:00'), s('10:30'), s('15:00')]);
	});

	it('does not offer times earlier than the lead time', () => {
		expect(bookableStarts([s('10:00'), s('10:30')], 1, s('10:30'))).toEqual([s('10:30')]);
	});
});

describe('respondDeadline', () => {
	it('is 24 hours for a visit far away', () => {
		expect(respondDeadline(NOW, at('2026-09-25T05:00:00Z'))).toEqual(at('2026-09-22T01:00:00Z'));
	});

	it('is an hour before a visit that comes sooner', () => {
		expect(respondDeadline(NOW, at('2026-09-21T06:00:00Z'))).toEqual(at('2026-09-21T05:00:00Z'));
	});
});

describe('snapshotConsents', () => {
	const both = [
		{ consentType: BookingConsentType.SHARE_DATA, agreed: true },
		{ consentType: BookingConsentType.BOOKING_TERMS, agreed: true },
	];

	it('stamps the server-side version and time', () => {
		expect(snapshotConsents(both, NOW)).toEqual([
			{ consentType: 'SHARE_DATA', agreed: true, version: 'share-v1', agreedAt: NOW },
			{ consentType: 'BOOKING_TERMS', agreed: true, version: 'terms-v1', agreedAt: NOW },
		]);
	});

	it.each([
		['missing', [both[0]]],
		['not agreed', [both[0], { ...both[1], agreed: false }]],
		['empty', []],
	])('refuses a required consent %s', (_name, given) => {
		expect(() => snapshotConsents(given, NOW)).toThrow(Messages.CONSENT_REQUIRED);
	});
});

describe('status machine', () => {
	const FAR = at('2026-09-25T05:00:00Z'); // 4 days ahead
	const SOON = at('2026-09-21T13:00:00Z'); // 12 hours ahead
	const PAST = at('2026-09-20T05:00:00Z');
	const move =
		(from: BookingStatus, to: BookingStatus, actor: BookingActor | null, extra: object = {}) =>
		() =>
			checkTransition({ from, to, actor, bookingDate: FAR, now: NOW, ...extra });

	it('maps member types to actors; a doctor is not one', () => {
		expect(actorOf(MemberType.USER)).toBe(BookingActor.PATIENT);
		expect(actorOf(MemberType.AGENT)).toBe(BookingActor.CLINIC);
		expect(actorOf(MemberType.ADMIN)).toBe(BookingActor.ADMIN);
		expect(actorOf(MemberType.DOCTOR)).toBeNull();
	});

	it('lets the clinic confirm and decline a request', () => {
		expect(move(BookingStatus.PENDING, BookingStatus.CONFIRMED, BookingActor.CLINIC)).not.toThrow();
		expect(
			move(BookingStatus.PENDING, BookingStatus.DECLINED, BookingActor.CLINIC, { reason: 'Full' }),
		).not.toThrow();
	});

	it('refuses every move that is not in the table', () => {
		const all = Object.values(BookingStatus);
		const actors = [...Object.values(BookingActor), null];
		let refused = 0;
		for (const from of all)
			for (const to of all)
				for (const actor of actors) {
					if (TRANSITIONS[from]?.[to]?.includes(actor as BookingActor)) continue;
					expect(move(from, to, actor, { reason: 'x' })).toThrow();
					refused++;
				}
		expect(refused).toBeGreaterThan(180);
	});

	it('refuses a patient confirming their own request', () => {
		expect(move(BookingStatus.PENDING, BookingStatus.CONFIRMED, BookingActor.PATIENT)).toThrow(
			Messages.TRANSITION_NOT_ALLOWED,
		);
	});

	it('refuses a doctor anything', () => {
		expect(move(BookingStatus.PENDING, BookingStatus.CONFIRMED, null)).toThrow(
			Messages.TRANSITION_NOT_ALLOWED,
		);
	});

	it('says why an expired request cannot be answered', () => {
		expect(move(BookingStatus.EXPIRED, BookingStatus.CONFIRMED, BookingActor.CLINIC)).toThrow(
			Messages.RESPOND_DEADLINE_PASSED,
		);
	});

	it('needs a reason to decline, and for a clinic or admin cancel — not for a patient', () => {
		expect(
			move(BookingStatus.PENDING, BookingStatus.DECLINED, BookingActor.CLINIC, { reason: ' ' }),
		).toThrow(Messages.REASON_REQUIRED);
		expect(move(BookingStatus.CONFIRMED, BookingStatus.CANCELLED, BookingActor.CLINIC)).toThrow(
			Messages.REASON_REQUIRED,
		);
		expect(move(BookingStatus.PENDING, BookingStatus.CANCELLED, BookingActor.ADMIN)).toThrow(
			Messages.REASON_REQUIRED,
		);
		expect(
			move(BookingStatus.PENDING, BookingStatus.CANCELLED, BookingActor.PATIENT),
		).not.toThrow();
	});

	it('lets a patient cancel a confirmed booking only up to 24 hours before', () => {
		expect(
			move(BookingStatus.CONFIRMED, BookingStatus.CANCELLED, BookingActor.PATIENT),
		).not.toThrow();
		expect(
			move(BookingStatus.CONFIRMED, BookingStatus.CANCELLED, BookingActor.PATIENT, {
				bookingDate: SOON,
			}),
		).toThrow(Messages.CANCEL_TOO_LATE);
	});

	it('lets a patient cancel a request at any time before the visit', () => {
		expect(
			move(BookingStatus.PENDING, BookingStatus.CANCELLED, BookingActor.PATIENT, {
				bookingDate: SOON,
			}),
		).not.toThrow();
	});

	it('marks COMPLETED and NO_SHOW only after the visit started, cancels only before', () => {
		expect(move(BookingStatus.CONFIRMED, BookingStatus.COMPLETED, BookingActor.CLINIC)).toThrow(
			Messages.VISIT_NOT_STARTED,
		);
		expect(
			move(BookingStatus.CONFIRMED, BookingStatus.NO_SHOW, BookingActor.CLINIC, {
				bookingDate: PAST,
			}),
		).not.toThrow();
		expect(
			move(BookingStatus.CONFIRMED, BookingStatus.CANCELLED, BookingActor.CLINIC, {
				bookingDate: PAST,
				reason: 'x',
			}),
		).toThrow(Messages.VISIT_STARTED);
	});

	it('treats PENDING past its deadline as EXPIRED', () => {
		const pending = { bookingStatus: BookingStatus.PENDING, respondDeadline: NOW };
		expect(effectiveStatus(pending, NOW)).toBe(BookingStatus.EXPIRED);
		expect(effectiveStatus({ ...pending, respondDeadline: FAR }, NOW)).toBe(BookingStatus.PENDING);
	});

	it('books the slots on confirm, frees them on every ending that is not a visit', () => {
		expect(slotEffect(BookingStatus.CONFIRMED)).toBe('BOOK');
		for (const s of [BookingStatus.DECLINED, BookingStatus.EXPIRED, BookingStatus.CANCELLED])
			expect(slotEffect(s)).toBe('RELEASE');
		for (const s of [BookingStatus.COMPLETED, BookingStatus.NO_SHOW])
			expect(slotEffect(s)).toBe('KEEP');
	});
});

describe('lists', () => {
	const ids = { memberId: 'm', clinicId: 'c', doctorId: 'd' };

	it('scopes every role from the token', () => {
		expect(bookingScope(MemberType.USER, ids)).toEqual({ memberId: 'm' });
		expect(bookingScope(MemberType.AGENT, ids)).toEqual({ clinicId: 'c' });
		expect(bookingScope(MemberType.DOCTOR, ids)).toEqual({ doctorId: 'd' });
		expect(bookingScope(MemberType.ADMIN, ids)).toEqual({});
	});

	it('filters PENDING and EXPIRED the way effectiveStatus reads them', () => {
		expect(statusMatch(BookingStatus.PENDING, NOW)).toEqual({
			bookingStatus: 'PENDING',
			respondDeadline: { $gt: NOW },
		});
		expect(statusMatch(BookingStatus.EXPIRED, NOW).$or).toHaveLength(2);
		expect(statusMatch(BookingStatus.CONFIRMED, NOW)).toEqual({ bookingStatus: 'CONFIRMED' });
	});

	it('makes a code from the Seoul year and six digits', () => {
		expect(makeBookingCode(at('2026-12-31T16:00:00Z'), () => 0.0625)).toBe('MV-2027-062500');
	});
});
