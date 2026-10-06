import { UseGuards } from '@nestjs/common';
import { Args, Context, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Throttle } from '@nestjs/throttler';
import type { ObjectId } from 'mongoose';
import { MemberService } from './member.service';
import { Member, Members } from '../../libs/dto/member/member';
import {
	ChangePasswordInput,
	GoogleLoginInput,
	LoginInput,
	MemberInput,
	MembersInquiry,
} from '../../libs/dto/member/member.input';
import { MemberAdminUpdate, MemberUpdate } from '../../libs/dto/member/member.update';
import { MemberType } from '../../libs/enums/member.enum';
import type { AuthMember as AuthMemberType, T } from '../../libs/types/common';
import { AuthMember } from '../auth/decorators/authMember.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthGuard } from '../auth/guards/auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { GqlThrottlerGuard } from '../auth/guards/gql-throttler.guard';

const ONE_MINUTE = 60_000;

@Resolver()
export class MemberResolver {
	constructor(private readonly memberService: MemberService) {}

	@Throttle({ default: { limit: 10, ttl: ONE_MINUTE } })
	@UseGuards(GqlThrottlerGuard)
	@Mutation(() => Member)
	public async signup(
		@Args('input') input: MemberInput,
		@Context() { req, res }: T,
	): Promise<Member> {
		console.log('Mutation: signup');
		return await this.memberService.signup(input, req, res);
	}

	@Throttle({ default: { limit: 5, ttl: ONE_MINUTE } })
	@UseGuards(GqlThrottlerGuard)
	@Mutation(() => Member)
	public async login(
		@Args('input') input: LoginInput,
		@Context() { req, res }: T,
	): Promise<Member> {
		console.log('Mutation: login');
		return await this.memberService.login(input, req, res);
	}

	@Throttle({ default: { limit: 10, ttl: ONE_MINUTE } })
	@UseGuards(GqlThrottlerGuard)
	@Mutation(() => Member)
	public async googleLogin(
		@Args('input') input: GoogleLoginInput,
		@Context() { req, res }: T,
	): Promise<Member> {
		console.log('Mutation: googleLogin');
		return await this.memberService.googleLogin(input, req, res);
	}

	@Mutation(() => Member)
	public async refreshToken(@Context() { req, res }: T): Promise<Member> {
		console.log('Mutation: refreshToken');
		return await this.memberService.refreshToken(req, res);
	}

	@UseGuards(AuthGuard)
	@Mutation(() => Boolean)
	public async logout(
		@AuthMember() authMember: AuthMemberType,
		@Context() { req, res }: T,
	): Promise<boolean> {
		console.log('Mutation: logout');
		return await this.memberService.logout(authMember, req, res);
	}

	@UseGuards(AuthGuard)
	@Mutation(() => Member)
	public async changePassword(
		@Args('input') input: ChangePasswordInput,
		@AuthMember() authMember: AuthMemberType,
		@Context() { req }: T,
	): Promise<Member> {
		console.log('Mutation: changePassword');
		return await this.memberService.changePassword(authMember, input, req);
	}

	@UseGuards(AuthGuard)
	@Query(() => Member)
	public async getMyProfile(@AuthMember('_id') memberId: ObjectId): Promise<Member> {
		console.log('Query: getMyProfile');
		return await this.memberService.getMyProfile(memberId);
	}

	@UseGuards(AuthGuard)
	@Mutation(() => Member)
	public async updateMember(
		@Args('input') input: MemberUpdate,
		@AuthMember('_id') memberId: ObjectId,
	): Promise<Member> {
		console.log('Mutation: updateMember');
		return await this.memberService.updateMember(memberId, input);
	}

	/** ADMIN **/

	@Roles(MemberType.ADMIN)
	@UseGuards(RolesGuard)
	@Query(() => Members)
	public async getAllMembersByAdmin(@Args('input') input: MembersInquiry): Promise<Members> {
		console.log('Query: getAllMembersByAdmin');
		return await this.memberService.getAllMembersByAdmin(input);
	}

	@Roles(MemberType.ADMIN)
	@UseGuards(RolesGuard)
	@Mutation(() => Member)
	public async updateMemberByAdmin(@Args('input') input: MemberAdminUpdate): Promise<Member> {
		console.log('Mutation: updateMemberByAdmin');
		return await this.memberService.updateMemberByAdmin(input);
	}
}
