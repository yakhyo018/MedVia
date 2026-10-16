import { Schema } from 'mongoose';
import { InquiryCategory, InquirySender, InquiryStatus } from '../libs/enums/inquiry.enum';
import { Language } from '../libs/enums/common.enum';

const InquiryMessageSchema = new Schema(
	{
		senderId: { type: Schema.Types.ObjectId, ref: 'Member', required: true },
		senderType: { type: String, enum: InquirySender, required: true },
		text: { type: String, required: true },
		lang: { type: String, enum: Language, required: true },
		createdAt: { type: Date, required: true },
	},
	{ _id: false },
);

/**
 * A 1:1 support ticket between a patient and the MedVia team — for what the clinic chat is not
 * for: a complaint about a clinic, a data-deletion request, a question before any booking.
 *
 * The thread is embedded (one read shows the whole ticket) and capped at 50 messages: an
 * unbounded array would grow the document towards MongoDB's 16 MB limit, and a ticket that
 * long should be a new one.
 */
const InquirySchema = new Schema(
	{
		inquiryCategory: {
			type: String,
			enum: InquiryCategory,
			required: true,
		},

		inquiryStatus: {
			type: String,
			enum: InquiryStatus,
			default: InquiryStatus.NEW,
		},

		inquiryTitle: {
			type: String,
			required: true,
			trim: true,
		},

		inquiryContent: {
			type: String,
			required: true,
		},

		inquiryLang: {
			type: String,
			enum: Language,
			required: true,
		},

		// "Reply language" — the team answers in it.
		inquiryReplyLang: {
			type: String,
			enum: Language,
			required: true,
		},

		inquiryMessages: {
			type: [InquiryMessageSchema],
			default: [],
		},

		resolvedAt: {
			type: Date,
		},

		memberId: {
			type: Schema.Types.ObjectId,
			required: true,
			ref: 'Member',
		},

		// Optional, and only one of the patient's own bookings.
		bookingId: {
			type: Schema.Types.ObjectId,
			ref: 'Booking',
		},
	},
	{ timestamps: true, collection: 'inquiries' },
);

// "My inquiries".
InquirySchema.index({ memberId: 1, createdAt: -1 });

// The team's queue: by status, oldest first.
InquirySchema.index({ inquiryStatus: 1, createdAt: 1 });

export default InquirySchema;
