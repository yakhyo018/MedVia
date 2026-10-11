import { Schema } from 'mongoose';
import { SlotStatus } from '../libs/enums/booking.enum';

/**
 * One 30-minute slot of one doctor. Created by the clinic ("Add slots"), inside its opening
 * hours. A treatment longer than 30 minutes holds several consecutive slots.
 *
 * The slot is the lock: a booking takes its slots with a conditional update inside a
 * transaction, never through Redis. slotEnd is not stored — it is always slotStart + 30 min.
 */
const SlotSchema = new Schema(
	{
		slotStatus: {
			type: String,
			enum: SlotStatus,
			default: SlotStatus.OPEN,
		},

		// UTC; shown in Asia/Seoul.
		slotStart: {
			type: Date,
			required: true,
		},

		// "Conference", "Personal" — shown to the clinic only.
		slotBlockReason: {
			type: String,
		},

		// When the hold dies: now + 10 min while the patient fills the form, then the clinic's
		// respondDeadline. A HELD slot past this moment counts as OPEN.
		holdExpiresAt: {
			type: Date,
		},

		// Who holds it while the form is being filled.
		holdMemberId: {
			type: Schema.Types.ObjectId,
			ref: 'Member',
		},

		// Set once the request is sent; kept while BOOKED.
		bookingId: {
			type: Schema.Types.ObjectId,
			ref: 'Booking',
		},

		doctorId: {
			type: Schema.Types.ObjectId,
			required: true,
			ref: 'Doctor',
		},

		clinicId: {
			type: Schema.Types.ObjectId,
			required: true,
			ref: 'Clinic',
		},
	},
	{ timestamps: true, collection: 'slots' },
);

// One slot per doctor and start time: "Add slots" twice over the same week creates nothing new.
SlotSchema.index({ doctorId: 1, slotStart: 1 }, { unique: true });

// The clinic's week view across all doctors.
SlotSchema.index({ clinicId: 1, slotStart: 1 });

// The batch SLOT_RELEASE sweep: holds that ran out.
SlotSchema.index({ slotStatus: 1, holdExpiresAt: 1 });

export default SlotSchema;
