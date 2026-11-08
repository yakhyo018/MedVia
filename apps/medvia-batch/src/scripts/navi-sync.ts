/**
 * Runs the NAVI_SYNC batch now, without waiting for 03:30 Seoul time:
 *
 *   npm run navi:sync
 *
 * The same code as the nightly cron (NaviSyncService) and the same `batchLogs` row, so the admin
 * dashboard shows this run too. Needs NAVI_URL / NAVI_API_KEY in .env and Navi running.
 */
import 'reflect-metadata';
import 'dotenv/config';
import mongoose, { Model, Schema } from 'mongoose';
import { BatchName, BatchStatus } from '../../../medvia-api/src/libs/enums/batch.enum';
import { T } from '../../../medvia-api/src/libs/types/common';
import BatchLogSchema from '../../../medvia-api/src/schemas/BatchLog.model';
import BoardArticleSchema from '../../../medvia-api/src/schemas/BoardArticle.model';
import ClinicSchema from '../../../medvia-api/src/schemas/Clinic.model';
import DoctorSchema from '../../../medvia-api/src/schemas/Doctor.model';
import MemberSchema from '../../../medvia-api/src/schemas/Member.model';
import NoticeSchema from '../../../medvia-api/src/schemas/Notice.model';
import TreatmentSchema from '../../../medvia-api/src/schemas/Treatment.model';
import { BatchLogService } from '../batch-log.service';
import { NaviSyncService } from '../jobs/navi-sync.service';

const model = (name: string, schema: Schema): Model<T> =>
	mongoose.models[name] ?? mongoose.model<T>(name, schema);

async function main(): Promise<void> {
	const production = process.env.NODE_ENV === 'production';
	const uri = production ? process.env.MONGO_PROD : process.env.MONGO_DEV;
	if (!uri) throw new Error(`No ${production ? 'MONGO_PROD' : 'MONGO_DEV'} in .env.`);
	await mongoose.connect(uri);

	const sync = new NaviSyncService(
		model('Clinic', ClinicSchema),
		model('Doctor', DoctorSchema),
		model('Treatment', TreatmentSchema),
		model('BoardArticle', BoardArticleSchema),
		model('Notice', NoticeSchema),
		model('Member', MemberSchema),
	);
	const log = await new BatchLogService(model('BatchLog', BatchLogSchema)).run(
		BatchName.NAVI_SYNC,
		() => sync.run(),
	);
	if (!log) throw new Error('NAVI_SYNC is already running (see batchLogs).');
	console.log(`NAVI_SYNC ${log.batchStatus} — ${log.batchResult}`);
	if (log.batchStatus !== BatchStatus.SUCCESS) process.exitCode = 1;
}

main()
	.catch((err) => {
		console.error(`\n${err.message}\n`);
		process.exitCode = 1;
	})
	.finally(() => mongoose.disconnect());
