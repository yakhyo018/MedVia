import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Queue } from 'bullmq';
import { Model } from 'mongoose';
import { BatchRun, BatchStatusView, QueueCounts } from '../../libs/dto/batch-log/batch-log';
import { BatchName } from '../../libs/enums/batch.enum';
import { T } from '../../libs/types/common';
import { BOOKING_QUEUE } from '../booking/booking.jobs';

/** A dashboard must not hang on Redis: BullMQ waits for a lost connection forever. */
const QUEUE_TIMEOUT_MS = 1_000;

/**
 * "Batch jobs" on the admin dashboard: the last run of each batch (written by medvia-batch in
 * `batchLogs`) and the API's booking queue. Read-only — the auditLogs' neighbour in the "ops"
 * domain: one is what people decided, the other what the machine did.
 */
@Injectable()
export class BatchStatusService {
	private readonly logger = new Logger(BatchStatusService.name);

	constructor(
		@InjectModel('BatchLog') private readonly batchLogModel: Model<T>,
		@InjectQueue(BOOKING_QUEUE) private readonly bookingQueue: Queue,
	) {}

	public async getBatchStatus(): Promise<BatchStatusView> {
		const [batches, queue] = await Promise.all([
			Promise.all(Object.values(BatchName).map((name) => this.lastRun(name))),
			this.queueCounts(),
		]);
		return { batches, queue: queue ?? undefined };
	}

	private async lastRun(batchName: BatchName): Promise<BatchRun> {
		const last = await this.batchLogModel
			.findOne({ batchName })
			.sort({ startedAt: -1 })
			.lean()
			.exec();
		return (last ?? { batchName }) as BatchRun;
	}

	private async queueCounts(): Promise<QueueCounts | null> {
		const timeout = new Promise<null>((resolve) =>
			setTimeout(() => resolve(null), QUEUE_TIMEOUT_MS),
		);
		try {
			const counts = await Promise.race([
				this.bookingQueue.getJobCounts('delayed', 'waiting', 'active', 'failed'),
				timeout,
			]);
			return counts as QueueCounts | null;
		} catch (err: any) {
			this.logger.warn(`queue counts unavailable: ${err.message}`);
			return null;
		}
	}
}
