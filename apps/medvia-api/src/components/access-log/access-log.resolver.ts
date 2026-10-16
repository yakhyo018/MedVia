import { UseGuards } from '@nestjs/common';
import { Args, Query, Resolver } from '@nestjs/graphql';
import type { ObjectId } from 'mongoose';
import { AccessLogService } from './access-log.service';
import { AccessLogs, AccessLogsInquiry } from '../../libs/dto/access-log/access-log';
import { OrdinaryInquiry } from '../../libs/dto/common/inquiry';
import { MemberType } from '../../libs/enums/member.enum';
import { AuthMember } from '../auth/decorators/authMember.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';

@Resolver()
export class AccessLogResolver {
	constructor(private readonly accessLogService: AccessLogService) {}

	/** The patient: who has read my medical data. */
	@Roles(MemberType.USER)
	@UseGuards(RolesGuard)
	@Query(() => AccessLogs)
	public async getMyAccessLogs(
		@Args('input') input: OrdinaryInquiry,
		@AuthMember('_id') memberId: ObjectId,
	): Promise<AccessLogs> {
		console.log('Query: getMyAccessLogs');
		return await this.accessLogService.getMyAccessLogs(memberId, input);
	}

	@Roles(MemberType.ADMIN)
	@UseGuards(RolesGuard)
	@Query(() => AccessLogs)
	public async getAccessLogsByAdmin(@Args('input') input: AccessLogsInquiry): Promise<AccessLogs> {
		console.log('Query: getAccessLogsByAdmin');
		return await this.accessLogService.getAccessLogsByAdmin(input);
	}
}
