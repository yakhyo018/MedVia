import { Schema } from 'mongoose';
import { BatchName, BatchStatus } from '../libs/enums/batch.enum';

/** 30 days: a run log answers "did last night's RANK work?", it is not history. */
export const BATCH_LOG_TTL_SECONDS = 30 * 24 * 60 * 60;

/**
 * One scheduled batch run: what, when, how it ended. Written by the batch app only. Machine
 * work — a person's decision goes to `auditLogs`.
 */
const BatchLogSchema = new Schema(
	{
		batchName: {
			type: String,
			enum: BatchName,
			required: true,
		},

		batchStatus: {
			type: String,
			enum: BatchStatus,
			default: BatchStatus.RUNNING,
		},

		// "released 3 holds", "fixed 2 of 41 clinics", or the error message.
		batchResult: {
			type: String,
		},

		startedAt: {
			type: Date,
			required: true,
		},

		finishedAt: {
			type: Date,
		},
	},
	{ timestamps: true, collection: 'batchLogs' },
);

// The last runs of one batch, newest first; also "is one still RUNNING?".
BatchLogSchema.index({ batchName: 1, startedAt: -1 });

BatchLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: BATCH_LOG_TTL_SECONDS });

export default BatchLogSchema;
