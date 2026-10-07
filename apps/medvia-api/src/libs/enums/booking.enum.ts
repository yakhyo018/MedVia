import { registerEnumType } from '@nestjs/graphql';

/**
 * OPEN ──► HELD     a patient picked the time (10 min), then the request waits for the clinic
 * HELD ──► BOOKED   the clinic confirmed
 * HELD | BOOKED ──► OPEN   declined, expired, cancelled
 * OPEN ◄──► BLOCKED        the clinic
 *
 * A HELD slot whose holdExpiresAt has passed counts as OPEN — nothing has to release it.
 */
export enum SlotStatus {
	OPEN = 'OPEN',
	HELD = 'HELD',
	BOOKED = 'BOOKED',
	BLOCKED = 'BLOCKED',
}
registerEnumType(SlotStatus, { name: 'SlotStatus' });

/**
 * PENDING ──► CONFIRMED | DECLINED (clinic) │ CANCELLED (patient, admin) │ EXPIRED (deadline)
 * CONFIRMED ──► COMPLETED | NO_SHOW (clinic, after the start) │ CANCELLED (patient, clinic, admin)
 *
 * The full table, with who may do what and when, is TRANSITIONS in booking.rules.ts.
 */
export enum BookingStatus {
	PENDING = 'PENDING',
	CONFIRMED = 'CONFIRMED',
	DECLINED = 'DECLINED',
	EXPIRED = 'EXPIRED',
	CANCELLED = 'CANCELLED',
	COMPLETED = 'COMPLETED',
	NO_SHOW = 'NO_SHOW',
}
registerEnumType(BookingStatus, { name: 'BookingStatus' });

/** Who moved a booking. Derived from the member type of the token, never from input. */
export enum BookingActor {
	PATIENT = 'PATIENT',
	CLINIC = 'CLINIC',
	ADMIN = 'ADMIN',
}
registerEnumType(BookingActor, { name: 'BookingActor' });

/** The checkboxes on "Review and give consent". Both are required for a request. */
export enum BookingConsentType {
	SHARE_DATA = 'SHARE_DATA',
	BOOKING_TERMS = 'BOOKING_TERMS',
}
registerEnumType(BookingConsentType, { name: 'BookingConsentType' });

/** "My Bookings" tabs. */
export enum BookingTab {
	UPCOMING = 'UPCOMING',
	PAST = 'PAST',
	CANCELLED = 'CANCELLED',
}
registerEnumType(BookingTab, { name: 'BookingTab' });
