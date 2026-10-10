import { Schema } from 'mongoose';
import { ReportGroup, ReportReason, ReportStatus } from '../libs/enums/report.enum';

/**
 * One member's report of one post or comment. Who decided and when is in the audit log, not
 * here. The unique index makes "report" count distinct people: reporting twice changes nothing.
 */
const ReportSchema = new Schema(
	{
		reportGroup: {
			type: String,
			enum: ReportGroup,
			required: true,
		},

		reportReason: {
			type: String,
			enum: ReportReason,
			required: true,
		},

		reportDetail: {
			type: String,
		},

		reportStatus: {
			type: String,
			enum: ReportStatus,
			default: ReportStatus.PENDING,
		},

		reportRefId: {
			type: Schema.Types.ObjectId,
			required: true,
		},

		memberId: {
			type: Schema.Types.ObjectId,
			required: true,
			ref: 'Member',
		},
	},
	{ timestamps: true, collection: 'reports' },
);

ReportSchema.index({ memberId: 1, reportRefId: 1 }, { unique: true });

// The admin queue, oldest first.
ReportSchema.index({ reportStatus: 1, createdAt: 1 });

// Closing every pending report of one target at once.
ReportSchema.index({ reportRefId: 1, reportStatus: 1 });

export default ReportSchema;
