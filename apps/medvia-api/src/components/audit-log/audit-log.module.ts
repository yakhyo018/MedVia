import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BullModule } from '@nestjs/bullmq';
import { AuditLogService } from './audit-log.service';
import { BatchStatusService } from './batch-status.service';
import { AuditLogResolver } from './audit-log.resolver';
import { AuthModule } from '../auth/auth.module';
import { BOOKING_QUEUE } from '../booking/booking.jobs';
import AuditLogSchema from '../../schemas/AuditLog.model';
import BatchLogSchema from '../../schemas/BatchLog.model';

/**
 * The "ops" logs: auditLogs (what admins decided; written by every module through
 * AuditLogService) and batchLogs (what the batch did; read here only). The booking queue is
 * registered by name for its counts — not BookingModule, which imports this one.
 */
@Module({
	imports: [
		MongooseModule.forFeature([
			{ name: 'AuditLog', schema: AuditLogSchema },
			{ name: 'BatchLog', schema: BatchLogSchema },
		]),
		BullModule.registerQueue({ name: BOOKING_QUEUE }),
		AuthModule,
	],
	providers: [AuditLogService, BatchStatusService, AuditLogResolver],
	exports: [AuditLogService],
})
export class AuditLogModule {}
