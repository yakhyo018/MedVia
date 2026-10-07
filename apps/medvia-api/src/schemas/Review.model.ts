import { Schema } from 'mongoose';
import { ReplierType, ReviewFlag, ReviewStatus, ReviewTag } from '../libs/enums/review.enum';
import { Language } from '../libs/enums/common.enum';

/** One public reply per review, by the clinic or the doctor of the visit. Editable. */
const ReviewReplySchema = new Schema(
	{
		replyContent: { type: String, required: true },
		replyLang: { type: String, enum: Language, required: true },
		replierId: { type: Schema.Types.ObjectId, ref: 'Member', required: true },
		replierType: { type: String, enum: ReplierType, required: true },
		repliedAt: { type: Date, required: true },
	},
	{ _id: false },
);

/**
 * A verified review: one per COMPLETED booking, written by that booking's patient. Checked by
 * an admin against medical-ad rules before it is public. Who decided and when is in the audit
 * log, not here.
 */
const ReviewSchema = new Schema(
	{
		reviewStatus: {
			type: String,
			enum: ReviewStatus,
			default: ReviewStatus.PENDING,
		},

		reviewRating: {
			type: Number,
			required: true,
			min: 1,
			max: 5,
		},

		reviewTags: {
			type: [{ type: String, enum: ReviewTag }],
			default: [],
		},

		// Set by the admin with "request edit" or "hide": the structured reason.
		reviewFlags: {
			type: [{ type: String, enum: ReviewFlag }],
			default: [],
		},

		reviewContent: {
			type: String,
			required: true,
		},

		reviewLang: {
			type: String,
			enum: Language,
			required: true,
		},

		reviewReply: {
			type: ReviewReplySchema,
		},

		// The admin's message with "request edit" or "hide". Shown to the patient.
		reviewNote: {
			type: String,
		},

		// Set on creation and on every edit; the admin queue is ordered by it.
		submittedAt: {
			type: Date,
			required: true,
		},

		deletedAt: {
			type: Date,
		},

		bookingId: {
			type: Schema.Types.ObjectId,
			required: true,
			ref: 'Booking',
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
	},
	{ timestamps: true, collection: 'reviews' },
);

// One review per booking — also after it is deleted (soft delete keeps the document).
ReviewSchema.index({ bookingId: 1 }, { unique: true });

// Reviews on a clinic page and in the clinic's dashboard; the rating recompute.
ReviewSchema.index({ clinicId: 1, reviewStatus: 1, createdAt: -1 });

// Reviews on a doctor page and in the doctor panel.
ReviewSchema.index({ doctorId: 1, reviewStatus: 1, createdAt: -1 });

// "My Reviews".
ReviewSchema.index({ memberId: 1, createdAt: -1 });

// Admin queue: oldest submission first.
ReviewSchema.index({ reviewStatus: 1, submittedAt: 1 });

export default ReviewSchema;
