import { Schema } from 'mongoose';
import { TreatmentCategory, TreatmentStatus } from '../libs/enums/treatment.enum';
import { Language } from '../libs/enums/common.enum';

/**
 * An edit of a live treatment waiting for the admin. Only the fields that medical-ad rules
 * cover go here (name, category, a lower price, note, description, photos); the live
 * treatment keeps serving the old values until the edit is approved.
 */
const TreatmentDraftSchema = new Schema(
	{
		treatmentName: { type: String, trim: true },
		treatmentCategory: { type: String, enum: TreatmentCategory },
		treatmentPrice: { type: Number, min: 0 },
		treatmentPriceNote: { type: String },
		treatmentDesc: { type: String },
		treatmentImages: { type: [String], default: undefined },
		// Moves on every change of the draft; the admin's approval names the version it saw.
		submittedAt: { type: Date, required: true },
	},
	{ _id: false },
);

/**
 * A treatment of one clinic, performed by one or more of its doctors. Public only while the
 * treatment and the clinic are ACTIVE. A booking (M5) copies the price, so a later price
 * change never touches what a patient already agreed to pay.
 */
const TreatmentSchema = new Schema(
	{
		treatmentStatus: {
			type: String,
			enum: TreatmentStatus,
			default: TreatmentStatus.PENDING,
		},

		treatmentName: {
			type: String,
			required: true,
			trim: true,
		},

		treatmentCategory: {
			type: String,
			enum: TreatmentCategory,
			required: true,
		},

		// Minutes. A booking holds ceil(duration / 30) consecutive 30-minute slots (M5).
		treatmentDuration: {
			type: Number,
			required: true,
			min: 10,
			max: 240,
		},

		// KRW, "price from".
		treatmentPrice: {
			type: Number,
			required: true,
			min: 0,
		},

		treatmentPriceNote: {
			type: String,
			default: '',
		},

		treatmentDesc: {
			type: String,
			default: '',
		},

		// Sent to the patient after the visit (M5 / M9).
		treatmentAftercare: {
			type: String,
			default: '',
		},

		treatmentLangs: {
			type: [{ type: String, enum: Language }],
			default: [],
		},

		treatmentImages: {
			type: [String],
			default: [],
		},

		// At least one when created or shown. Can become empty when the last doctor is removed —
		// the treatment is then hidden automatically.
		doctorIds: {
			type: [{ type: Schema.Types.ObjectId, ref: 'Doctor' }],
			default: [],
		},

		// The admin's message on "request edit" or "reject", or why the system hid it.
		treatmentReviewNote: {
			type: String,
		},

		treatmentDraft: {
			type: TreatmentDraftSchema,
		},

		clinicId: {
			type: Schema.Types.ObjectId,
			required: true,
			ref: 'Clinic',
		},

		// Set on creation and on every resubmission; the admin queue is ordered by it.
		submittedAt: {
			type: Date,
			required: true,
		},

		verifiedAt: {
			type: Date,
		},

		deletedAt: {
			type: Date,
		},
	},
	{ timestamps: true, collection: 'treatments' },
);

// The clinic's table and the treatments on a clinic page.
TreatmentSchema.index({ clinicId: 1, treatmentStatus: 1, createdAt: 1 });

// Admin queue of new treatments: oldest submission first.
TreatmentSchema.index({ treatmentStatus: 1, submittedAt: 1 });

// "Treatments by Dr. Han" — a multikey index: one entry per doctor id in the array.
TreatmentSchema.index({ doctorIds: 1, treatmentStatus: 1 });

// Admin queue of edits waiting for review. Partial: only treatments that have a draft are in it.
TreatmentSchema.index(
	{ 'treatmentDraft.submittedAt': 1 },
	{ partialFilterExpression: { treatmentDraft: { $exists: true } } },
);

export default TreatmentSchema;
