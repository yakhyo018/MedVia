import { Global, Logger, Module } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_CLIENT, RedisService } from './redis.service';
import { CacheService } from './cache.service';

@Global()
@Module({
	providers: [
		{
			provide: REDIS_CLIENT,
			useFactory: () => {
				const logger = new Logger('Redis');
				const client = new Redis(process.env.REDIS_URL as string, {
					maxRetriesPerRequest: 3,
					lazyConnect: false,
				});
				client.on('connect', () => logger.log('Redis connected'));
				client.on('error', (err) => logger.error(`Redis error: ${err.message}`));
				return client;
			},
		},
		RedisService,
		CacheService,
	],
	exports: [RedisService, CacheService],
})
export class RedisModule {}
