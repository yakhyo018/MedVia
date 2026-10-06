import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuditLogService } from './audit-log.service';
import { AuditLogResolver } from './audit-log.resolver';
import { AuthModule } from '../auth/auth.module';
import AuditLogSchema from '../../schemas/AuditLog.model';

@Module({
	imports: [MongooseModule.forFeature([{ name: 'AuditLog', schema: AuditLogSchema }]), AuthModule],
	providers: [AuditLogService, AuditLogResolver],
	exports: [AuditLogService],
})
export class AuditLogModule {}
