import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class BatchService {
	private readonly logger = new Logger(BatchService.name);

	public getHello(): string {
		return 'Welcome to the MedVia BATCH server!';
	}

	/** Real jobs arrive in M9; this proves the scheduler is wired. */
	public async batchHeartbeat(): Promise<void> {
		this.logger.log('batch heartbeat');
	}
}
