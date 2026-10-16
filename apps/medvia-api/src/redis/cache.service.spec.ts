import { Test } from '@nestjs/testing';
import { CacheService } from './cache.service';
import { RedisService } from './redis.service';

/**
 * A few lines of in-memory Redis: enough for GET, SET (with EX / PX / NX) and UNLINK.
 * Handed to CacheService through DI in place of the real RedisService — the class under
 * test never knows.
 */
class FakeRedis {
	public readonly store = new Map<string, string>();
	public commands: string[] = [];

	public async get(key: string): Promise<string | null> {
		this.commands.push(`GET ${key}`);
		return this.store.get(key) ?? null;
	}

	public async set(key: string, value: string, ...args: unknown[]): Promise<'OK' | null> {
		this.commands.push(`SET ${key} ${args.join(' ')}`.trim());
		if (args.includes('NX') && this.store.has(key)) return null;
		this.store.set(key, value);
		return 'OK';
	}

	public async unlink(...keys: string[]): Promise<number> {
		keys.forEach((key) => this.store.delete(key));
		return keys.length;
	}
}

/** Redis is down: every command fails. */
class DeadRedis {
	public async get(): Promise<never> {
		throw new Error('connect ECONNREFUSED');
	}
	public async set(): Promise<never> {
		throw new Error('connect ECONNREFUSED');
	}
	public async unlink(): Promise<never> {
		throw new Error('connect ECONNREFUSED');
	}
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function cacheWith(redis: object): Promise<CacheService> {
	const moduleRef = await Test.createTestingModule({
		providers: [CacheService, { provide: RedisService, useValue: { redis } }],
	}).compile();
	return moduleRef.get(CacheService);
}

describe('CacheService.wrap', () => {
	let redis: FakeRedis;
	let cache: CacheService;

	beforeEach(async () => {
		redis = new FakeRedis();
		cache = await cacheWith(redis);
	});

	it('loads on a miss, stores with a TTL, and serves the next call from Redis', async () => {
		const loader = jest.fn(async () => ({ clinics: 3 }));

		await expect(cache.wrap('clinic:list:a', 60, loader)).resolves.toEqual({ clinics: 3 });
		await expect(cache.wrap('clinic:list:a', 60, loader)).resolves.toEqual({ clinics: 3 });

		expect(loader).toHaveBeenCalledTimes(1);
		expect(redis.commands).toContain('SET clinic:list:a EX 60');
	});

	it('single-flight: 50 concurrent misses run the loader once', async () => {
		const loader = jest.fn(async () => {
			await sleep(120);
			return { clinics: 3 };
		});

		const results = await Promise.all(
			Array.from({ length: 50 }, () => cache.wrap('clinic:list:hot', 60, loader)),
		);

		expect(loader).toHaveBeenCalledTimes(1);
		expect(results.every((r) => r.clinics === 3)).toBe(true);
		const lockAttempts = redis.commands.filter((c) => c.startsWith('SET lock:clinic:list:hot'));
		expect(lockAttempts).toHaveLength(50);
		expect(lockAttempts[0]).toBe('SET lock:clinic:list:hot PX 3000 NX');
	});

	it('releases the lock after loading', async () => {
		await cache.wrap('clinic:detail:1', 60, async () => ({ id: 1 }));
		expect(redis.store.has('lock:clinic:detail:1')).toBe(false);
	});

	it('penetration: caches "not found" so the next request does not reach the database', async () => {
		const loader = jest.fn(async () => null);

		await expect(cache.wrap('clinic:detail:missing', 60, loader)).resolves.toBeNull();
		await expect(cache.wrap('clinic:detail:missing', 60, loader)).resolves.toBeNull();

		expect(loader).toHaveBeenCalledTimes(1);
		expect(redis.commands).toContain('SET clinic:detail:missing EX 30');
	});

	it('get() reports a cached "not found" as null, not as the sentinel string', async () => {
		await cache.wrap('clinic:detail:missing', 60, async () => null);
		await expect(cache.get('clinic:detail:missing')).resolves.toBeNull();
	});
});

describe('CacheService with Redis down', () => {
	it('falls back to the loader: slower, never broken', async () => {
		const cache = await cacheWith(new DeadRedis());
		const loader = jest.fn(async () => ({ clinics: 3 }));

		await expect(cache.wrap('clinic:list:a', 60, loader)).resolves.toEqual({ clinics: 3 });
		await expect(cache.get('clinic:list:a')).resolves.toBeNull();
		expect(loader).toHaveBeenCalledTimes(1);
	});
});
