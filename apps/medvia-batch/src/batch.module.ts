import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { BatchController } from './batch.controller';
import { BatchService } from './batch.service';
import { DatabaseModule } from './database/database.module';
import { envValidationSchema } from '../../medvia-api/src/libs/utils/env.validation';

@Module({
	imports: [
		ConfigModule.forRoot({ isGlobal: true, validationSchema: envValidationSchema }),
		ScheduleModule.forRoot(),
		DatabaseModule,
	],
	controllers: [BatchController],
	providers: [BatchService],
})
export class BatchModule {}
