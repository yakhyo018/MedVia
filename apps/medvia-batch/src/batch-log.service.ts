import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BatchName, BatchStatus } from '../../medvia-api/src/libs/enums/batch.enum';
import { T } from '../../medvia-api/src/libs/types/common';

/** A run older than this that still says RUNNING died with its process; it no longer blocks. */
const STALE_RUN_MS = 60 * 60_000;

/**
 * Wraps every batch run: RUNNING → SUCCESS (with the result) or FAILED (with the error). A run
 * never overlaps itself — a slow RANK and the next one would write the same scores twice.
 * Never throws: a failed run is logged and the next schedule tries again.
 */
@Injectable()
export class BatchLogService {
	private readonly logger = new Logger(BatchLogService.name);

	constructor(@InjectModel('BatchLog') private readonly batchLogModel: Model<T>) {}

	public async run(name: BatchName, work: () => Promise<string>): Promise<T | null> {
		const now = new Date();
		const busy = await this.batchLogModel
			.exists({
				batchName: name,
				batchStatus: BatchStatus.RUNNING,
				startedAt: { $gt: new Date(now.getTime() - STALE_RUN_MS) },
			})
			.exec();
		if (busy) {
			this.logger.warn(`${name} is still running; this run is skipped`);
			return null;
		}

		const log = await this.batchLogModel.create({ batchName: name, startedAt: now });
		let set: T;
		try {
			const result = await work();
			set = { batchStatus: BatchStatus.SUCCESS, batchResult: result };
			this.logger.log(`${name}: ${result}`);
		} catch (err: any) {
			set = { batchStatus: BatchStatus.FAILED, batchResult: err?.message ?? String(err) };
			this.logger.error(`${name} failed: ${set.batchResult}`);
		}
		return await this.batchLogModel
			.findByIdAndUpdate(log._id, { $set: { ...set, finishedAt: new Date() } }, { new: true })
			.lean()
			.exec();
	}
}
