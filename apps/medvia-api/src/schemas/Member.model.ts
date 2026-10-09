import { Schema } from 'mongoose';
import { MemberAuthType, MemberStatus, MemberType } from '../libs/enums/member.enum';
import { Language } from '../libs/enums/common.enum';

/** Embedded: read with the member, never referenced from anywhere else. */
const NotifySettingsSchema = new Schema(
	{
		bookingUpdates: { type: Boolean, default: true },
		visitReminders: { type: Boolean, default: true },
		chatMessages: { type: Boolean, default: true },
	},
	{ _id: false },
);

/**
 * An account, not a profile. Clinics and doctors keep their public pages in their
 * own collections; this one only answers "who is signed in, and in which role".
 */
const MemberSchema = new Schema(
	{
		memberType: {
			type: String,
			enum: MemberType,
			default: MemberType.USER,
		},

		memberStatus: {
			type: String,
			enum: MemberStatus,
			default: MemberStatus.ACTIVE,
		},

		memberAuthType: {
			type: String,
			enum: MemberAuthType,
			required: true,
		},

		memberEmail: {
			type: String,
			required: true,
			unique: true,
			lowercase: true,
			trim: true,
		},

		memberPassword: {
			type: String,
			select: false,
		},

		memberGoogleId: {
			type: String,
		},

		memberMustChangePassword: {
			type: Boolean,
			default: false,
		},

		memberFullName: {
			type: String,
			required: true,
			trim: true,
		},

		memberPhone: {
			type: String,
		},

		memberImage: {
			type: String,
			default: '',
		},

		memberCountry: {
			type: String,
		},

		memberLang: {
			type: String,
			enum: Language,
			default: Language.EN,
		},

		memberNotify: {
			type: NotifySettingsSchema,
			default: () => ({}),
		},

		memberTermsAt: {
			type: Date,
			required: true,
		},

		memberLastLoginAt: {
			type: Date,
		},

		// "Allow AI translation of my chat messages" — the text goes to an outside AI provider.
		// Absent or withdrawn: messages travel untranslated. The version names the text agreed to.
		memberAiConsentAt: {
			type: Date,
		},

		memberAiConsentVersion: {
			type: String,
		},

		deletedAt: {
			type: Date,
		},
	},
	{ timestamps: true, collection: 'members' },
);

// Sparse: most accounts have no Google id. A plain unique index would store each
// missing value as null and reject the second account without one.
MemberSchema.index({ memberGoogleId: 1 }, { unique: true, sparse: true });

// Admin list: filter by role and status, newest first (equality fields, then the sort).
MemberSchema.index({ memberType: 1, memberStatus: 1, createdAt: -1 });

export default MemberSchema;
