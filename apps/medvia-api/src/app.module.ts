import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { GraphQLModule } from '@nestjs/graphql';
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
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
				// @nestjs/apollo maps only 400, 401, 403 and 422 to codes; a NotFoundException
				// would otherwise reach the client as INTERNAL_SERVER_ERROR.
				const code = res?.statusCode === 404 ? 'NOT_FOUND' : error?.extensions?.code;
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
		ComponentsModule,
	],
	controllers: [AppController],
	providers: [AppService, AppResolver],
})
export class AppModule {}
