import { Schema } from 'mongoose';
import { ClinicStatus, District, Specialty } from '../libs/enums/clinic.enum';
import { Language } from '../libs/enums/common.enum';

/** One row per weekday, 0 = Sunday. Times are Seoul wall-clock strings, not dates. */
const ClinicHourSchema = new Schema(
	{
		day: { type: Number, required: true, min: 0, max: 6 },
		open: { type: String },
		close: { type: String },
		closed: { type: Boolean, default: false },
	},
	{ _id: false },
);

/**
 * GeoJSON point. No defaults on purpose: a half-built point ({ type: 'Point' } without
 * coordinates) makes the 2dsphere index reject the whole document. Absent is fine —
 * the index simply skips clinics that have no pin yet.
 */
const GeoPointSchema = new Schema(
	{
		type: { type: String, enum: ['Point'], required: true },
		coordinates: { type: [Number], required: true, default: undefined }, // [lng, lat]
	},
	{ _id: false },
);

/**
 * A clinic's public page. The login lives in `members` (memberType AGENT), linked 1:1
 * by memberId. Listed only after an admin approves it.
 *
 * Counters here are the ones a clinic card or page reads on every view. Rating, review
 * count and rank arrive with the milestones that write them (M6, M9).
 */
const ClinicSchema = new Schema(
	{
		clinicStatus: {
			type: String,
			enum: ClinicStatus,
			default: ClinicStatus.PENDING,
		},

		clinicName: {
			type: String,
			required: true,
			trim: true,
		},

		// As on the signboard — patients use it to find the entrance.
		clinicNameKo: {
			type: String,
			trim: true,
		},

		clinicSpecialty: {
			type: String,
			enum: Specialty,
			required: true,
		},

		clinicDistrict: {
			type: String,
			enum: District,
			required: true,
		},

		clinicAddress: {
			type: String,
			required: true,
			trim: true,
		},

		clinicLocation: {
			type: GeoPointSchema,
		},

		clinicPhone: {
			type: String,
		},

		clinicHours: {
			type: [ClinicHourSchema],
			default: [],
		},

		clinicLangs: {
			type: [{ type: String, enum: Language }],
			default: [],
		},

		clinicInterpreterLangs: {
			type: [{ type: String, enum: Language }],
			default: [],
		},

		clinicLogo: {
			type: String,
			default: '',
		},

		clinicImages: {
			type: [String],
			default: [],
		},

		clinicDesc: {
			type: String,
			default: '',
		},

		// The admin's message on "request changes" or "reject". Shown to the clinic.
		clinicReviewNote: {
			type: String,
		},

		// Lowest price of the clinic's ACTIVE treatments ("From ₩99,000"); null without any.
		// Derived: recomputed from `treatments` on every treatment change, never incremented.
		clinicMinPrice: {
			type: Number,
			default: null,
		},

		// Names of the ACTIVE treatments, copied so one search over clinics also finds
		// "laser toning". Derived the same way as clinicMinPrice — rebuilt, not kept in sync.
		clinicTreatmentNames: {
			type: [String],
			default: [],
		},

		clinicLikes: {
			type: Number,
			default: 0,
		},

		clinicFollowers: {
			type: Number,
			default: 0,
		},

		clinicViews: {
			type: Number,
			default: 0,
		},

		memberId: {
			type: Schema.Types.ObjectId,
			required: true,
			ref: 'Member',
		},

		// Set on signup and on every resubmission; the admin queue is ordered by it.
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
	{ timestamps: true, collection: 'clinics' },
);

// One AGENT account, one clinic.
ClinicSchema.index({ memberId: 1 }, { unique: true });

// Public list: equality on status first, then the default sort.
ClinicSchema.index({ clinicStatus: 1, createdAt: -1 });

// Admin verification queue: oldest submission first.
ClinicSchema.index({ clinicStatus: 1, submittedAt: 1 });

// "Similar clinics nearby" — $geoNear needs a geo index and must be the first stage.
ClinicSchema.index({ clinicLocation: '2dsphere' });

export default ClinicSchema;
