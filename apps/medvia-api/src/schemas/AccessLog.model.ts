import { Schema } from 'mongoose';
import { AccessType } from '../libs/enums/access-log.enum';
import { MemberType } from '../libs/enums/member.enum';

/** A year: long enough to answer "who saw my data?", short enough not to keep it forever. */
export const ACCESS_LOG_TTL_SECONDS = 365 * 24 * 60 * 60;

/**
 * One reading of a patient's medical data (questionnaire answers, AI summary) by someone else:
 * the clinic or the doctor of the booking. Append-only. The reader's name and the booking code
 * are copied on purpose — a log records what happened then, and must not change when a clinic
 * is renamed later.
 */
const AccessLogSchema = new Schema(
	{
		accessType: {
			type: String,
			enum: AccessType,
			required: true,
		},

		bookingId: {
			type: Schema.Types.ObjectId,
			required: true,
			ref: 'Booking',
		},

		bookingCode: {
			type: String,
		},

		// Whose data it is.
		patientId: {
			type: Schema.Types.ObjectId,
			required: true,
			ref: 'Member',
		},

		readerId: {
			type: Schema.Types.ObjectId,
			required: true,
			ref: 'Member',
		},

		readerType: {
			type: String,
			enum: MemberType,
			required: true,
		},

		// "Seoul Glow Dermatology", "Dr. Han Seo-yeon" — as shown at the time of reading.
		readerName: {
			type: String,
		},
	},
	{ timestamps: { createdAt: true, updatedAt: false }, collection: 'accessLogs' },
);

// "Who saw my data?" and the admin's view of one patient, newest first.
AccessLogSchema.index({ patientId: 1, createdAt: -1 });

// Every reading of one booking.
AccessLogSchema.index({ bookingId: 1, createdAt: -1 });

AccessLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: ACCESS_LOG_TTL_SECONDS });

export default AccessLogSchema;
