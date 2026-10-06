import { Schema } from 'mongoose';
import { AuditAction, AuditGroup } from '../libs/enums/admin.enum';

/**
 * Every admin decision, append-only: rows are inserted, never updated or removed.
 * A past decision cannot be reconstructed later, so the log starts with the first one.
 */
const AuditLogSchema = new Schema(
	{
		auditAction: {
			type: String,
			enum: AuditAction,
			required: true,
		},

		auditGroup: {
			type: String,
			enum: AuditGroup,
			required: true,
		},

		auditRefId: {
			type: Schema.Types.ObjectId,
			required: true,
		},

		auditNote: {
			type: String,
		},

		// The admin who decided.
		memberId: {
			type: Schema.Types.ObjectId,
			required: true,
			ref: 'Member',
		},
	},
	{ timestamps: { createdAt: true, updatedAt: false }, collection: 'auditLogs' },
);

// History of one clinic (or treatment, review ...), newest first.
AuditLogSchema.index({ auditGroup: 1, auditRefId: 1, createdAt: -1 });

export default AuditLogSchema;
