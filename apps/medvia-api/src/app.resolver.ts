import { Query, Resolver } from '@nestjs/graphql';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import { Health } from './libs/dto/common/health';
import { RedisService } from './redis/redis.service';

const MONGO_STATES = ['disconnected', 'connected', 'connecting', 'disconnecting'];

@Resolver()
export class AppResolver {
	constructor(
		@InjectConnection() private readonly connection: Connection,
		private readonly redisService: RedisService,
	) {}

	/** One query that proves the API, Atlas and Redis are all reachable. */
	@Query(() => Health)
	public async health(): Promise<Health> {
		const mongo = MONGO_STATES[this.connection.readyState] ?? 'unknown';
		const redis = await this.redisService.ping();
		const ok = mongo === 'connected' && redis === 'PONG';

		return { status: ok ? 'ok' : 'degraded', mongo, redis, time: new Date() };
	}
}
