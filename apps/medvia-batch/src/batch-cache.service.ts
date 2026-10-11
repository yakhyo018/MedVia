import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';

/**
 * The API's cache keys, cleared after a batch rewrote what they hold. Best effort: a key that
 * survives an error still expires with its TTL. SCAN, never KEYS (which blocks Redis for the
 * whole keyspace); UNLINK, never DEL (memory is freed off the main thread).
 */
@Injectable()
export class BatchCacheService implements OnModuleDestroy {
	private readonly logger = new Logger(BatchCacheService.name);
	private readonly redis = new Redis(process.env.REDIS_URL as string, { maxRetriesPerRequest: 3 });

	constructor() {
		this.redis.on('error', (err) => this.logger.error(`Redis error: ${err.message}`));
	}

	public async unlink(keys: string[]): Promise<void> {
		if (!keys.length) return;
		try {
			await this.redis.unlink(...keys);
		} catch (err: any) {
			this.logger.warn(`cache keys not cleared: ${err.message}`);
		}
	}

	public async unlinkPattern(pattern: string): Promise<void> {
		try {
			let cursor = '0';
			do {
				const [next, keys] = await this.redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
				cursor = next;
				if (keys.length) await this.redis.unlink(...keys);
			} while (cursor !== '0');
		} catch (err: any) {
			this.logger.warn(`cache ${pattern} not cleared: ${err.message}`);
		}
	}

	public async onModuleDestroy(): Promise<void> {
		await this.redis.quit().catch(() => undefined);
	}
}
