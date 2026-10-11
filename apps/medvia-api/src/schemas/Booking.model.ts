import { Schema } from 'mongoose';
import { BookingActor, BookingConsentType, BookingStatus } from '../libs/enums/booking.enum';
import { Language } from '../libs/enums/common.enum';

/**
 * The patient's answers, encrypted with AES-256-GCM (MEDICAL_ENC_KEY). The database, its
 * backups and anyone with Compass access see only `v1:<iv>:<tag>:<data>`.
 */
const QuestionnaireSchema = new Schema(
	{
		answersEnc: { type: String, required: true },
		// Open: AI-1 translates from it.
		originalLang: { type: String, enum: Language, required: true },
	},
	{ _id: false },
);

/** What the patient agreed to, with the version of the text — proof, not a preference. */
const ConsentSnapshotSchema = new Schema(
	{
		consentType: { type: String, enum: BookingConsentType, required: true },
		agreed: { type: Boolean, required: true },
		version: { type: String, required: true },
		agreedAt: { type: Date, required: true },
	},
	{ _id: false },
);

/** One row per status change. respondedAt / cancelledAt are read from here. */
const StatusChangeSchema = new Schema(
	{
		status: { type: String, enum: BookingStatus, required: true },
		changedBy: { type: Schema.Types.ObjectId, ref: 'Member' },
		reason: { type: String },
		changedAt: { type: Date, required: true },
	},
	{ _id: false },
);

/**
 * A booking request of one patient for one treatment with one doctor. The price is a copy
 * taken when the request is sent: a later price change never touches what the patient agreed.
 */
const BookingSchema = new Schema(
	{
		// MV-2026-482913 — what the patient reads out at the reception.
		bookingCode: {
			type: String,
			required: true,
		},

		bookingStatus: {
			type: String,
			enum: BookingStatus,
			default: BookingStatus.PENDING,
		},

		// Start of the first slot (UTC).
		bookingDate: {
			type: Date,
			required: true,
		},

		// KRW snapshot of treatmentPrice.
		bookingPrice: {
			type: Number,
			required: true,
			min: 0,
		},

		bookingLang: {
			type: String,
			enum: Language,
			required: true,
		},

		bookingInterpreter: {
			type: String,
			enum: Language,
		},

		bookingQuestionnaire: {
			type: QuestionnaireSchema,
			required: true,
		},

		// The Korean AI summary of the answers for the doctor (AI-1), encrypted like them.
		// Only with the AI_SUMMARY consent; absent while it is being written or if AI failed.
		bookingAiSummaryEnc: {
			type: String,
		},

		bookingConsents: {
			type: [ConsentSnapshotSchema],
			default: [],
		},

		bookingHistory: {
			type: [StatusChangeSchema],
			default: [],
		},

		bookingDeclineReason: {
			type: String,
		},

		cancelledBy: {
			type: String,
			enum: BookingActor,
		},

		// The clinic answers by then, or the request expires and the slots are free again.
		respondDeadline: {
			type: Date,
			required: true,
		},

		// "Your visit is coming up" was sent (or the confirmation came inside the last day).
		// Set by a conditional update, so two workers never send the reminder twice.
		bookingRemindedAt: {
			type: Date,
		},

		// A review needs a COMPLETED booking, written within 30 days of this.
		completedAt: {
			type: Date,
		},

		// Set with the review, in its transaction, and never reset: a deleted review is final.
		bookingReviewed: {
			type: Boolean,
			default: false,
		},

		memberId: {
			type: Schema.Types.ObjectId,
			required: true,
			ref: 'Member',
		},

		clinicId: {
			type: Schema.Types.ObjectId,
			required: true,
			ref: 'Clinic',
		},

		doctorId: {
			type: Schema.Types.ObjectId,
			required: true,
			ref: 'Doctor',
		},

		treatmentId: {
			type: Schema.Types.ObjectId,
			required: true,
			ref: 'Treatment',
		},

		// ceil(treatmentDuration / 30) consecutive slots of the doctor.
		slotIds: {
			type: [{ type: Schema.Types.ObjectId, ref: 'Slot' }],
			required: true,
		},
	},
	{ timestamps: true, collection: 'bookings' },
);

BookingSchema.index({ bookingCode: 1 }, { unique: true });

// "My Bookings", newest first.
BookingSchema.index({ memberId: 1, bookingDate: -1 });

// The clinic's booking list, filtered by status.
BookingSchema.index({ clinicId: 1, bookingStatus: 1, bookingDate: -1 });

// The doctor's own list; and "does this doctor still have upcoming bookings?".
BookingSchema.index({ doctorId: 1, bookingDate: -1 });

// Bookings per treatment this month, for the clinic's treatment table.
BookingSchema.index({ treatmentId: 1, bookingDate: 1 });

// The admin dashboard: requests per Seoul day and per language.
BookingSchema.index({ createdAt: 1 });

// The expiry sweep: PENDING past respondDeadline.
BookingSchema.index({ bookingStatus: 1, respondDeadline: 1 });

// The reminder sweep: CONFIRMED with the visit in the next day; also the rank's
// "COMPLETED in the last 90 days".
BookingSchema.index({ bookingStatus: 1, bookingDate: 1 });

export default BookingSchema;
