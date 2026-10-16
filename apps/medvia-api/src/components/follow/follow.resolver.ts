import { UseGuards } from '@nestjs/common';
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import type { ObjectId } from 'mongoose';
import { FollowService } from './follow.service';
import { Follow, Followings } from '../../libs/dto/follow/follow';
import { FollowInput, FollowingsInquiry } from '../../libs/dto/follow/follow.input';
import { AuthMember } from '../auth/decorators/authMember.decorator';
import { AuthGuard } from '../auth/guards/auth.guard';

@Resolver()
export class FollowResolver {
	constructor(private readonly followService: FollowService) {}

	@UseGuards(AuthGuard)
	@Mutation(() => Follow)
	public async followMember(
		@Args('input') input: FollowInput,
		@AuthMember('_id') memberId: ObjectId,
	): Promise<Follow> {
		console.log('Mutation: followMember');
		return await this.followService.followMember(memberId, input);
	}

	@UseGuards(AuthGuard)
	@Mutation(() => Boolean)
	public async unfollowMember(
		@Args('input') input: FollowInput,
		@AuthMember('_id') memberId: ObjectId,
	): Promise<boolean> {
		console.log('Mutation: unfollowMember');
		return await this.followService.unfollowMember(memberId, input);
	}

	@UseGuards(AuthGuard)
	@Query(() => Followings)
	public async getMyFollowings(
		@Args('input') input: FollowingsInquiry,
		@AuthMember('_id') memberId: ObjectId,
	): Promise<Followings> {
		console.log('Query: getMyFollowings');
		return await this.followService.getMyFollowings(memberId, input);
	}
}
