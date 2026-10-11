import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { GraphQLModule } from '@nestjs/graphql';
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { BullModule } from '@nestjs/bullmq';
import { AppController } from './app.controller';
import { AppResolver } from './app.resolver';
import { AppService } from './app.service';
import { DatabaseModule } from './database/database.module';
import { RedisModule } from './redis/redis.module';
import { ComponentsModule } from './components/components.module';
import { envValidationSchema } from './libs/utils/env.validation';
import { T } from './libs/types/common';

@Module({
	imports: [
		ConfigModule.forRoot({ isGlobal: true, validationSchema: envValidationSchema }),
		GraphQLModule.forRoot<ApolloDriverConfig>({
			driver: ApolloDriver,
			playground: true,
			autoSchemaFile: true,
			// res is needed to set and clear the refresh-token cookie from a resolver.
			context: ({ req, res }: T) => ({ req, res }),
			formatError: (error: T) => {
				const res = error?.extensions?.originalError || error?.extensions?.response;
				const rawMsg = res?.message || error?.message;
				// @nestjs/apollo maps only 400, 401, 403 and 422 to codes; a NotFoundException or
				// a ServiceUnavailableException (the AI assistant's provider is down) would
				// otherwise reach the client as INTERNAL_SERVER_ERROR — "the server broke".
				const mapped: Record<number, string> = { 404: 'NOT_FOUND', 503: 'SERVICE_UNAVAILABLE' };
				const code = mapped[res?.statusCode] ?? error?.extensions?.code;
				const formatted = {
					extensions: { code },
					message: Array.isArray(rawMsg) ? rawMsg.join('; ') : rawMsg,
				};
				console.log('GRAPHQL GLOBAL ERR:', formatted);
				return formatted;
			},
		}),
		DatabaseModule,
		RedisModule,
		// The job queue (M9) on the same Redis. maxRetriesPerRequest: null is what BullMQ
		// requires for its workers' blocking reads; keys live under `queue:<name>:…`.
		BullModule.forRootAsync({
			useFactory: () => ({
				connection: { url: process.env.REDIS_URL, maxRetriesPerRequest: null },
				prefix: 'queue',
			}),
		}),
		ComponentsModule,
	],
	controllers: [AppController],
	providers: [AppService, AppResolver],
})
export class AppModule {}
