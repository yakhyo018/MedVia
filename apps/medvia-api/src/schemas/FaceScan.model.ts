import { Schema } from 'mongoose';
import { Specialty } from '../libs/enums/clinic.enum';
import {
	ConcernSeverity,
	FaceScanStatus,
	FaceZone,
	PhotoQualityIssue,
	SkinConcern,
} from '../libs/enums/face-scan.enum';
import { Language } from '../libs/enums/common.enum';

const FindingSchema = new Schema(
	{
		concern: { type: String, enum: SkinConcern, required: true },
		severity: { type: String, enum: ConcernSeverity, required: true },
		zone: { type: String, enum: FaceZone, required: true },
	},
	{ _id: false },
);

/**
 * One face-photo reading for a patient. The photo itself is never stored: it lives in the
 * request's memory, goes to the model and is gone — the patient keeps it on their own phone.
 * What stays is the reading: fixed codes, and the patient-facing summary encrypted with
 * MEDICAL_ENC_KEY (AES-256-GCM, Advanced Encryption Standard in Galois/Counter Mode).
 */
const FaceScanSchema = new Schema(
	{
		faceScanStatus: {
			type: String,
			enum: FaceScanStatus,
			default: FaceScanStatus.PENDING,
		},

		findings: {
			type: [FindingSchema],
			default: [],
		},

		qualityIssues: {
			type: [String],
			enum: PhotoQualityIssue,
			default: [],
		},

		// `v1:<iv>:<tag>:<data>` (crypto.util). Free text about the patient's face: encrypted.
		faceScanSummary: {
			type: String,
		},

		// The summary's language — the patient's memberLang at the time of the scan.
		faceScanLang: {
			type: String,
			enum: Language,
			required: true,
		},

		// Set by face-scan.rules from the findings, never by the model.
		suggestedSpecialty: {
			type: String,
			enum: Specialty,
		},

		// Which provider read it (fake / openrouter / anthropic) — a reading is only as good as
		// its model, and the fake's readings must be recognisable.
		aiProvider: {
			type: String,
			required: true,
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
	{ timestamps: true, collection: 'faceScans' },
);

// "My scans": the member's own, newest first, deleted ones filtered by status.
FaceScanSchema.index({ memberId: 1, faceScanStatus: 1, createdAt: -1 });

export default FaceScanSchema;
