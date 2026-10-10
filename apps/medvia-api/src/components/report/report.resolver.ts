import { UseGuards } from '@nestjs/common';
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import type { ObjectId } from 'mongoose';
import { ReportService } from './report.service';
import {
	ModerationInput,
	ModerationResult,
	Report,
	ReportInput,
	Reports,
	ReportsInquiry,
} from '../../libs/dto/report/report';
import { MemberType } from '../../libs/enums/member.enum';
import type { AuthMember as AuthMemberType } from '../../libs/types/common';
import { AuthMember } from '../auth/decorators/authMember.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';

@Resolver()
export class ReportResolver {
	constructor(private readonly reportService: ReportService) {}

	@Roles(MemberType.USER, MemberType.DOCTOR)
	@UseGuards(RolesGuard)
	@Mutation(() => Report)
	public async reportContent(
		@Args('input') input: ReportInput,
		@AuthMember() authMember: AuthMemberType,
	): Promise<Report> {
		console.log('Mutation: reportContent');
		return await this.reportService.reportContent(authMember, input);
	}

	/** ADMIN **/

	@Roles(MemberType.ADMIN)
	@UseGuards(RolesGuard)
	@Query(() => Reports)
	public async getReportsByAdmin(@Args('input') input: ReportsInquiry): Promise<Reports> {
		console.log('Query: getReportsByAdmin');
		return await this.reportService.getReportsByAdmin(input);
	}

	@Roles(MemberType.ADMIN)
	@UseGuards(RolesGuard)
	@Mutation(() => ModerationResult)
	public async moderateContent(
		@Args('input') input: ModerationInput,
		@AuthMember('_id') adminId: ObjectId,
	): Promise<ModerationResult> {
		console.log('Mutation: moderateContent');
		return await this.reportService.moderateContent(adminId, input);
	}
}
