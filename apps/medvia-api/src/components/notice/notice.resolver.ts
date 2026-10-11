import { UseGuards } from '@nestjs/common';
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import type { ObjectId } from 'mongoose';
import { NoticeService } from './notice.service';
import {
	AdminNoticesInquiry,
	Notice,
	NoticeInput,
	Notices,
	NoticesInquiry,
	NoticeUpdate,
} from '../../libs/dto/notice/notice';
import { Language } from '../../libs/enums/common.enum';
import { MemberType } from '../../libs/enums/member.enum';
import type { AuthMember as AuthMemberType } from '../../libs/types/common';
import { AuthMember } from '../auth/decorators/authMember.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { WithoutGuard } from '../auth/guards/without.guard';

@Resolver()
export class NoticeResolver {
	constructor(private readonly noticeService: NoticeService) {}

	/** PUBLIC — a signed-in reader gets their memberLang **/

	@UseGuards(WithoutGuard)
	@Query(() => Notices)
	public async getNotices(
		@Args('input') input: NoticesInquiry,
		@AuthMember() authMember: AuthMemberType | null,
	): Promise<Notices> {
		console.log('Query: getNotices');
		return await this.noticeService.getNotices(authMember, input);
	}

	@UseGuards(WithoutGuard)
	@Query(() => Notice)
	public async getNotice(
		@Args('noticeId') noticeId: string,
		@Args('lang', { type: () => Language, nullable: true }) lang: Language | undefined,
		@AuthMember() authMember: AuthMemberType | null,
	): Promise<Notice> {
		console.log('Query: getNotice');
		return await this.noticeService.getNotice(authMember, noticeId, lang);
	}

	/** ADMIN **/

	@Roles(MemberType.ADMIN)
	@UseGuards(RolesGuard)
	@Mutation(() => Notice)
	public async createNotice(
		@Args('input') input: NoticeInput,
		@AuthMember('_id') adminId: ObjectId,
	): Promise<Notice> {
		console.log('Mutation: createNotice');
		return await this.noticeService.createNotice(adminId, input);
	}

	@Roles(MemberType.ADMIN)
	@UseGuards(RolesGuard)
	@Mutation(() => Notice)
	public async updateNotice(
		@Args('input') input: NoticeUpdate,
		@AuthMember('_id') adminId: ObjectId,
	): Promise<Notice> {
		console.log('Mutation: updateNotice');
		return await this.noticeService.updateNotice(adminId, input);
	}

	@Roles(MemberType.ADMIN)
	@UseGuards(RolesGuard)
	@Mutation(() => Notice)
	public async removeNotice(
		@Args('noticeId') noticeId: string,
		@AuthMember('_id') adminId: ObjectId,
	): Promise<Notice> {
		console.log('Mutation: removeNotice');
		return await this.noticeService.removeNotice(adminId, noticeId);
	}

	@Roles(MemberType.ADMIN)
	@UseGuards(RolesGuard)
	@Query(() => Notices)
	public async getNoticesByAdmin(@Args('input') input: AdminNoticesInquiry): Promise<Notices> {
		console.log('Query: getNoticesByAdmin');
		return await this.noticeService.getNoticesByAdmin(input);
	}
}
