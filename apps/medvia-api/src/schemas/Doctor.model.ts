import { Schema } from 'mongoose';
import { DoctorStatus } from '../libs/enums/doctor.enum';
import { Specialty } from '../libs/enums/clinic.enum';
import { Language } from '../libs/enums/common.enum';

/** One line of "Education and career". Years are free text: "2014", "present". */
const CareerItemSchema = new Schema(
	{
		title: { type: String, required: true, trim: true },
		place: { type: String, trim: true },
		from: { type: String, trim: true },
		to: { type: String, trim: true },
	},
	{ _id: false },
);

/**
 * A doctor's public page. The login lives in `members` (memberType DOCTOR), created by
 * the clinic together with this row. A doctor is shown only while both the doctor and
 * their clinic are ACTIVE — the clinic's status is read from `clinics`, never copied here.
 *
 * Answer count and rank arrive with M8 and M9.
 */
const DoctorSchema = new Schema(
	{
		doctorStatus: {
			type: String,
			enum: DoctorStatus,
			default: DoctorStatus.ACTIVE,
		},

		doctorName: {
			type: String,
			required: true,
			trim: true,
		},

		doctorNameKo: {
			type: String,
			trim: true,
		},

		// Set by the clinic; the doctor cannot change it.
		doctorSpecialty: {
			type: String,
			enum: Specialty,
			required: true,
		},

		// Years of experience.
		doctorExperience: {
			type: Number,
			min: 0,
			max: 60,
		},

		doctorLangs: {
			type: [{ type: String, enum: Language }],
			default: [],
		},

		doctorBio: {
			type: String,
			default: '',
		},

		doctorImage: {
			type: String,
			default: '',
		},

		doctorCareer: {
			type: [CareerItemSchema],
			default: [],
		},

		doctorLikes: {
			type: Number,
			default: 0,
		},

		doctorViews: {
			type: Number,
			default: 0,
		},

		doctorFollowers: {
			type: Number,
			default: 0,
		},

		// Average of the ACTIVE reviews (one decimal) and their count. Derived: recomputed from
		// `reviews` after every review change, never incremented.
		doctorRating: {
			type: Number,
			default: 0,
		},

		doctorReviews: {
			type: Number,
			default: 0,
		},

		clinicId: {
			type: Schema.Types.ObjectId,
			required: true,
			ref: 'Clinic',
		},

		memberId: {
			type: Schema.Types.ObjectId,
			required: true,
			ref: 'Member',
		},

		deletedAt: {
			type: Date,
		},
	},
	{ timestamps: true, collection: 'doctors' },
);

// One DOCTOR account, one doctor page.
DoctorSchema.index({ memberId: 1 }, { unique: true });

// A clinic's doctor table and the doctors on a clinic page.
DoctorSchema.index({ clinicId: 1, doctorStatus: 1, createdAt: 1 });

// Public doctor list: status first, then the default order. The active-clinic filter
// (`clinicId: { $in: [...] }`) is applied to the rows this index hands over.
DoctorSchema.index({ doctorStatus: 1, createdAt: -1 });

export default DoctorSchema;
