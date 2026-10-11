import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AccessLogService } from './access-log.service';
import { AccessLogResolver } from './access-log.resolver';
import { AuthModule } from '../auth/auth.module';
import AccessLogSchema from '../../schemas/AccessLog.model';

/** booking → access-log (each decrypt for a reader). It imports nothing back. */
@Module({
	imports: [
		MongooseModule.forFeature([{ name: 'AccessLog', schema: AccessLogSchema }]),
		AuthModule,
	],
	providers: [AccessLogService, AccessLogResolver],
	exports: [AccessLogService],
})
export class AccessLogModule {}
