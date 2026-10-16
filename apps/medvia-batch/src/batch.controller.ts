import { Controller, Get, NotFoundException, Param, Post } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { BatchName } from '../../medvia-api/src/libs/enums/batch.enum';
import { Messages } from '../../medvia-api/src/libs/enums/common.enum';
import { T } from '../../medvia-api/src/libs/types/common';
import { testSupportEnabled } from '../../medvia-api/src/libs/config';
import { BatchService } from './batch.service';
import { BatchLogService } from './batch-log.service';
import { SlotReleaseService } from './jobs/slot-release.service';
import { RecountService } from './jobs/recount.service';
import { RankService } from './jobs/rank.service';
import { BATCH_TIME_ZONE, CRON_RANK, CRON_RECOUNT, CRON_SLOT_RELEASE } from './libs/config';

/**
 * The whole-collection work, away from the API's event loop. The per-booking jobs (expiry,
 * reminder) run in the API's BullMQ worker instead, next to the booking code they reuse.
 */
@Controller()
export class BatchController {
	private readonly work: Record<BatchName, () => Promise<string>>;

	constructor(
		private readonly batchService: BatchService,
		private readonly batchLog: BatchLogService,
		slotRelease: SlotReleaseService,
		recount: RecountService,
		rank: RankService,
	) {
		this.work = {
			[BatchName.SLOT_RELEASE]: () => slotRelease.run(),
			[BatchName.RECOUNT]: () => recount.run(),
			[BatchName.RANK]: () => rank.run(),
		};
	}

	@Get()
	public getHello(): string {
		return this.batchService.getHello();
	}

	@Cron(CRON_SLOT_RELEASE, { name: BatchName.SLOT_RELEASE, timeZone: BATCH_TIME_ZONE })
	public async slotRelease(): Promise<void> {
		await this.runBatch(BatchName.SLOT_RELEASE);
	}

	@Cron(CRON_RECOUNT, { name: BatchName.RECOUNT, timeZone: BATCH_TIME_ZONE })
	public async recount(): Promise<void> {
		await this.runBatch(BatchName.RECOUNT);
	}

	@Cron(CRON_RANK, { name: BatchName.RANK, timeZone: BATCH_TIME_ZONE })
	public async rank(): Promise<void> {
		await this.runBatch(BatchName.RANK);
	}

	/**
	 * Postman: run a batch now and get its log row back. Only with ENABLE_TEST_SUPPORT and never
	 * in production; otherwise the route answers 404 as if it did not exist.
	 */
	@Post('dev/run/:name')
	public async devRun(@Param('name') name: string): Promise<T> {
		if (!testSupportEnabled() || !(name in this.work)) {
			throw new NotFoundException(Messages.NO_DATA_FOUND);
		}
		return (await this.runBatch(name as BatchName)) ?? { batchName: name, batchStatus: 'SKIPPED' };
	}

	private runBatch(name: BatchName): Promise<T | null> {
		return this.batchLog.run(name, this.work[name]);
	}
}
