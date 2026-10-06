import { Controller, Get, Logger } from '@nestjs/common';
import { Cron, Interval } from '@nestjs/schedule';
import { BatchService } from './batch.service';
import { BATCH_ROLLBACK } from './libs/config';

@Controller()
export class BatchController {
	private readonly logger = new Logger(BatchController.name);

	constructor(private readonly batchService: BatchService) {}

	@Get()
	public getHello(): string {
		return this.batchService.getHello();
	}

	@Cron('00 00 03 * * *', { name: BATCH_ROLLBACK })
	public async handleRollback(): Promise<void> {
		this.logger.debug(`EXECUTED: ${BATCH_ROLLBACK}`);
	}

	@Interval(60 * 60 * 1000)
	public async handleHeartbeat(): Promise<void> {
		await this.batchService.batchHeartbeat();
	}
}
