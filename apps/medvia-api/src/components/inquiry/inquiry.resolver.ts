import { UseGuards } from '@nestjs/common';
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import type { ObjectId } from 'mongoose';
import { InquiryService } from './inquiry.service';
import {
	AdminInquiriesInquiry,
	Inquiries,
	Inquiry,
	InquiryInput,
	InquiryMessageInput,
} from '../../libs/dto/inquiry/inquiry';
import { OrdinaryInquiry } from '../../libs/dto/common/inquiry';
import { MemberType } from '../../libs/enums/member.enum';
import type { AuthMember as AuthMemberType } from '../../libs/types/common';
import { AuthMember } from '../auth/decorators/authMember.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';

/** The two sides of a ticket: the patient and the MedVia team. */
const SIDES = [MemberType.USER, MemberType.ADMIN];

@Resolver()
export class InquiryResolver {
	constructor(private readonly inquiryService: InquiryService) {}

	@Roles(MemberType.USER)
	@UseGuards(RolesGuard)
	@Mutation(() => Inquiry)
	public async createInquiry(
		@Args('input') input: InquiryInput,
		@AuthMember('_id') memberId: ObjectId,
	): Promise<Inquiry> {
		console.log('Mutation: createInquiry');
		return await this.inquiryService.createInquiry(memberId, input);
	}

	@Roles(MemberType.USER)
	@UseGuards(RolesGuard)
	@Query(() => Inquiries)
	public async getMyInquiries(
		@Args('input') input: OrdinaryInquiry,
		@AuthMember('_id') memberId: ObjectId,
	): Promise<Inquiries> {
		console.log('Query: getMyInquiries');
		return await this.inquiryService.getMyInquiries(memberId, input);
	}

	/** BOTH SIDES — scoped by the token **/

	@Roles(...SIDES)
	@UseGuards(RolesGuard)
	@Query(() => Inquiry)
	public async getInquiry(
		@Args('inquiryId') inquiryId: string,
		@AuthMember() authMember: AuthMemberType,
	): Promise<Inquiry> {
		console.log('Query: getInquiry');
		return await this.inquiryService.getInquiry(authMember, inquiryId);
	}

	@Roles(...SIDES)
	@UseGuards(RolesGuard)
	@Mutation(() => Inquiry)
	public async addInquiryMessage(
		@Args('input') input: InquiryMessageInput,
		@AuthMember() authMember: AuthMemberType,
	): Promise<Inquiry> {
		console.log('Mutation: addInquiryMessage');
		return await this.inquiryService.addInquiryMessage(authMember, input);
	}

	@Roles(...SIDES)
	@UseGuards(RolesGuard)
	@Mutation(() => Inquiry)
	public async resolveInquiry(
		@Args('inquiryId') inquiryId: string,
		@AuthMember() authMember: AuthMemberType,
	): Promise<Inquiry> {
		console.log('Mutation: resolveInquiry');
		return await this.inquiryService.resolveInquiry(authMember, inquiryId);
	}

	/** ADMIN **/

	@Roles(MemberType.ADMIN)
	@UseGuards(RolesGuard)
	@Query(() => Inquiries)
	public async getInquiriesByAdmin(
		@Args('input') input: AdminInquiriesInquiry,
	): Promise<Inquiries> {
		console.log('Query: getInquiriesByAdmin');
		return await this.inquiryService.getInquiriesByAdmin(input);
	}
}
