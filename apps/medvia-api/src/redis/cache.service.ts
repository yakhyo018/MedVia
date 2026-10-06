import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from './redis.service';

/** Keys examined per SCAN round trip. A hint to Redis, not a hard limit. */
const SCAN_BATCH = 100;

/** Stored instead of JSON when the loader found nothing (cache penetration guard). */
const MISS_SENTINEL = '__miss__';
const MISS_TTL_SECONDS = 30;

/** Longer than a slow rebuild, short enough that a crashed holder blocks nobody for long. */
const LOCK_TTL_MS = 3_000;
const LOCK_WAIT_MS = 50;
const LOCK_WAIT_ATTEMPTS = 20;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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

	/** null for both "not cached" and "cached as missing"; wrap() tells them apart. */
	public async get<R>(key: string): Promise<R | null> {
		return ((await this.getRaw(key)) ?? null) as R | null;
	}

	public async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
		try {
			await this.redisService.redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
		} catch (err: any) {
			this.logger.warn(`cache set failed for ${key}: ${err.message}`);
		}
	}

	/**
	 * Read-through with two guards.
	 *
	 * Penetration — a loader result of null (an id that does not exist) is stored as a
	 * sentinel for `missTtlSeconds`, so repeated requests for it stop reaching MongoDB.
	 *
	 * Stampede — when a hot key expires, only one request rebuilds it. It wins a short
	 * lock (`SET lock:<key> 1 NX PX`: set only if absent, expire in milliseconds); every
	 * other request polls the cache briefly and receives the rebuilt value. The lock
	 * expires on its own, so a request that crashes while holding it blocks nobody for long.
	 */
	public async wrap<R>(
		key: string,
		ttlSeconds: number,
		loader: () => Promise<R>,
		missTtlSeconds = MISS_TTL_SECONDS,
	): Promise<R> {
		const hit = await this.getRaw(key);
		if (hit !== undefined) return hit as R;

		const lockKey = `lock:${key}`;
		if (await this.tryLock(lockKey)) {
			try {
				return await this.load(key, ttlSeconds, missTtlSeconds, loader);
			} finally {
				await this.unlock(lockKey);
			}
		}

		for (let attempt = 0; attempt < LOCK_WAIT_ATTEMPTS; attempt++) {
			await sleep(LOCK_WAIT_MS);
			const ready = await this.getRaw(key);
			if (ready !== undefined) return ready as R;
		}

		// The rebuild is taking too long (or Redis is down): read the database directly.
		return await loader();
	}

	private async load<R>(
		key: string,
		ttlSeconds: number,
		missTtlSeconds: number,
		loader: () => Promise<R>,
	): Promise<R> {
		const fresh = await loader();
		if (fresh === null || fresh === undefined) {
			await this.setRaw(key, MISS_SENTINEL, missTtlSeconds);
		} else {
			await this.set(key, fresh, ttlSeconds);
		}
		return fresh;
	}

	/** undefined = not cached; null = cached "does not exist". */
	private async getRaw(key: string): Promise<unknown> {
		try {
			const raw = await this.redisService.redis.get(key);
			if (raw === null) return undefined;
			return raw === MISS_SENTINEL ? null : JSON.parse(raw);
		} catch (err: any) {
			this.logger.warn(`cache get failed for ${key}: ${err.message}`);
			return undefined;
		}
	}

	private async setRaw(key: string, raw: string, ttlSeconds: number): Promise<void> {
		try {
			await this.redisService.redis.set(key, raw, 'EX', ttlSeconds);
		} catch (err: any) {
			this.logger.warn(`cache set failed for ${key}: ${err.message}`);
		}
	}

	/** Redis down counts as "got the lock": the request then simply reads the database. */
	private async tryLock(lockKey: string): Promise<boolean> {
		try {
			const ok = await this.redisService.redis.set(lockKey, '1', 'PX', LOCK_TTL_MS, 'NX');
			return ok === 'OK';
		} catch {
			return true;
		}
	}

	private async unlock(lockKey: string): Promise<void> {
		try {
			await this.redisService.redis.unlink(lockKey);
		} catch {
			// The lock expires by itself.
		}
	}

	/** Drops one known key. Cheaper than invalidate(): no SCAN. */
	public async del(key: string): Promise<void> {
		try {
			await this.redisService.redis.unlink(key);
		} catch (err: any) {
			this.logger.warn(`cache del failed for ${key}: ${err.message}`);
		}
	}

	/**
	 * Drops every key under a prefix, e.g. `clinic:list:*` after a clinic changes.
	 *
	 * SCAN, not KEYS: Redis runs commands on one thread, and KEYS walks the whole
	 * keyspace in a single call, blocking every other client until it finishes.
	 * SCAN returns a cursor and a small batch, so other commands run in between.
	 * UNLINK, not DEL: the memory is freed on a background thread.
	 */
	public async invalidate(pattern: string): Promise<number> {
		try {
			let cursor = '0';
			let removed = 0;
			do {
				const [next, keys] = await this.redisService.redis.scan(
					cursor,
					'MATCH',
					pattern,
					'COUNT',
					SCAN_BATCH,
				);
				cursor = next;
				if (keys.length > 0) removed += await this.redisService.redis.unlink(...keys);
			} while (cursor !== '0');
			return removed;
		} catch (err: any) {
			this.logger.warn(`cache invalidate failed for ${pattern}: ${err.message}`);
			return 0;
		}
	}
}
