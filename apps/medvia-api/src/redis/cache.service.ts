import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from './redis.service';

/**
 * Read-through cache over Redis.
 *
 * Redis is a cache and a queue here, never a second source of truth: every miss
 * falls back to MongoDB, and every Redis failure degrades to a plain DB read
 * instead of breaking the request.
 */
@Injectable()
export class CacheService {
	private readonly logger = new Logger(CacheService.name);

	constructor(private readonly redisService: RedisService) {}

	public async get<R>(key: string): Promise<R | null> {
		try {
			const raw = await this.redisService.redis.get(key);
			return raw ? (JSON.parse(raw) as R) : null;
		} catch (err: any) {
			this.logger.warn(`cache get failed for ${key}: ${err.message}`);
			return null;
		}
	}

	public async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
		try {
			await this.redisService.redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
		} catch (err: any) {
			this.logger.warn(`cache set failed for ${key}: ${err.message}`);
		}
	}

	/** Reads from the cache, otherwise runs the loader and stores its result. */
	public async wrap<R>(key: string, ttlSeconds: number, loader: () => Promise<R>): Promise<R> {
		const hit = await this.get<R>(key);
		if (hit !== null) return hit;

		const fresh = await loader();
		await this.set(key, fresh, ttlSeconds);
		return fresh;
	}

	/** Drops every key under a prefix, e.g. `clinic:list:*` after a clinic changes. */
	public async invalidate(pattern: string): Promise<number> {
		try {
			const keys = await this.redisService.redis.keys(pattern);
			if (keys.length === 0) return 0;
			return await this.redisService.redis.del(...keys);
		} catch (err: any) {
			this.logger.warn(`cache invalidate failed for ${pattern}: ${err.message}`);
			return 0;
		}
	}
}
