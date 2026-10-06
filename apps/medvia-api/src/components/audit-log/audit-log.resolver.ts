import { UseGuards } from '@nestjs/common';
import { Args, Query, Resolver } from '@nestjs/graphql';
import { AuditLogService } from './audit-log.service';
import { AuditLog, AuditLogsInquiry } from '../../libs/dto/audit-log/audit-log';
import { MemberType } from '../../libs/enums/member.enum';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';

@Resolver()
export class AuditLogResolver {
	constructor(private readonly auditLogService: AuditLogService) {}

	@Roles(MemberType.ADMIN)
	@UseGuards(RolesGuard)
	@Query(() => [AuditLog])
	public async getAuditLogsByAdmin(@Args('input') input: AuditLogsInquiry): Promise<AuditLog[]> {
		console.log('Query: getAuditLogsByAdmin');
		return await this.auditLogService.getAuditLogs(input);
	}
}
