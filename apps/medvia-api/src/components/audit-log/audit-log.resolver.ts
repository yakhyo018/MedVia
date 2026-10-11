import { UseGuards } from '@nestjs/common';
import { Args, Query, Resolver } from '@nestjs/graphql';
import { AuditLogService } from './audit-log.service';
import { BatchStatusService } from './batch-status.service';
import {
	AuditFeedInquiry,
	AuditLog,
	AuditLogs,
	AuditLogsInquiry,
} from '../../libs/dto/audit-log/audit-log';
import { BatchStatusView } from '../../libs/dto/batch-log/batch-log';
import { MemberType } from '../../libs/enums/member.enum';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';

@Resolver()
export class AuditLogResolver {
	constructor(
		private readonly auditLogService: AuditLogService,
		private readonly batchStatusService: BatchStatusService,
	) {}

	@Roles(MemberType.ADMIN)
	@UseGuards(RolesGuard)
	@Query(() => [AuditLog])
	public async getAuditLogsByAdmin(@Args('input') input: AuditLogsInquiry): Promise<AuditLog[]> {
		console.log('Query: getAuditLogsByAdmin');
		return await this.auditLogService.getAuditLogs(input);
	}

	@Roles(MemberType.ADMIN)
	@UseGuards(RolesGuard)
	@Query(() => AuditLogs)
	public async getAuditFeedByAdmin(@Args('input') input: AuditFeedInquiry): Promise<AuditLogs> {
		console.log('Query: getAuditFeedByAdmin');
		return await this.auditLogService.getAuditFeed(input);
	}

	@Roles(MemberType.ADMIN)
	@UseGuards(RolesGuard)
	@Query(() => BatchStatusView)
	public async getBatchStatusByAdmin(): Promise<BatchStatusView> {
		console.log('Query: getBatchStatusByAdmin');
		return await this.batchStatusService.getBatchStatus();
	}
}
