import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';

export const REDIS_CLIENT = 'REDIS_CLIENT';

@Injectable()
export class RedisService implements OnModuleDestroy {
	private readonly logger = new Logger(RedisService.name);

	constructor(@Inject(REDIS_CLIENT) private readonly client: Redis) {}

	public get redis(): Redis {
		return this.client;
	}

	/** PONG when the connection is alive; the error message otherwise. */
	public async ping(): Promise<string> {
		try {
			return await this.client.ping();
		} catch (err: any) {
			this.logger.error(`Redis ping failed: ${err.message}`);
			return `down: ${err.message}`;
		}
	}

	public async onModuleDestroy(): Promise<void> {
		await this.client.quit();
	}
}
