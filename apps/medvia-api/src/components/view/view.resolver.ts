import { UseGuards } from '@nestjs/common';
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import type { ObjectId } from 'mongoose';
import { ViewService } from './view.service';
import { OrdinaryInquiry } from '../../libs/dto/common/inquiry';
import { RecentVisits } from '../../libs/dto/view/view';
import { AuthMember } from '../auth/decorators/authMember.decorator';
import { AuthGuard } from '../auth/guards/auth.guard';

@Resolver()
export class ViewResolver {
	constructor(private readonly viewService: ViewService) {}

	@UseGuards(AuthGuard)
	@Query(() => RecentVisits)
	public async getRecentlyVisited(
		@Args('input') input: OrdinaryInquiry,
		@AuthMember('_id') memberId: ObjectId,
	): Promise<RecentVisits> {
		console.log('Query: getRecentlyVisited');
		return await this.viewService.getRecentlyVisited(memberId, input);
	}

	@UseGuards(AuthGuard)
	@Mutation(() => Boolean)
	public async clearRecentlyVisited(@AuthMember('_id') memberId: ObjectId): Promise<boolean> {
		console.log('Mutation: clearRecentlyVisited');
		return await this.viewService.clearRecentlyVisited(memberId);
	}
}
