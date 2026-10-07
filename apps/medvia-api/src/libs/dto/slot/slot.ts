import { Field, Int, ObjectType } from '@nestjs/graphql';
import type { ObjectId } from 'mongoose';
import { BookingStatus, SlotStatus } from '../../enums/booking.enum';

/** What the clinic's schedule shows on a taken slot: "Feride K. · Laser Toning". */
@ObjectType()
export class SlotBooking {
	@Field(() => String)
	bookingCode!: string;

	@Field(() => BookingStatus)
	bookingStatus!: BookingStatus;

	@Field(() => String)
	patientName!: string;

	@Field(() => String)
	treatmentName!: string;
}

/** A 30-minute slot. slotEnd = slotStart + 30 min. */
@ObjectType()
export class Slot {
	@Field(() => String)
	_id!: ObjectId;

	/** Effective: a hold that ran out is shown as OPEN. */
	@Field(() => SlotStatus)
	slotStatus!: SlotStatus;

	@Field(() => Date)
	slotStart!: Date;

	@Field(() => String, { nullable: true })
	slotBlockReason?: string;

	@Field(() => Date, { nullable: true })
	holdExpiresAt?: Date;

	@Field(() => String)
	doctorId!: ObjectId;

	@Field(() => String)
	clinicId!: ObjectId;

	@Field(() => String, { nullable: true })
	bookingId?: ObjectId;

	@Field(() => SlotBooking, { nullable: true })
	bookingData?: SlotBooking;
}

/** The answer to "hold this time": the slots and when the hold runs out (the timer). */
@ObjectType()
export class SlotHold {
	@Field(() => [String])
	slotIds!: ObjectId[];

	@Field(() => Date)
	slotStart!: Date;

	@Field(() => Date)
	holdExpiresAt!: Date;
}

@ObjectType()
export class SlotsCreated {
	/** New slots; times that already had a slot are skipped. */
	@Field(() => Int)
	created!: number;

	/** Inside the window and the opening hours. */
	@Field(() => Int)
	planned!: number;
}
