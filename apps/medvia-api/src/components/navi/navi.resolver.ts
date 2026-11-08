import { UseGuards } from '@nestjs/common';
import { Args, Query, Resolver } from '@nestjs/graphql';
import { AskNaviInput, NaviAnswer } from '../../libs/dto/navi/navi';
import type { AuthMember as AuthMemberType } from '../../libs/types/common';
import { AuthMember } from '../auth/decorators/authMember.decorator';
import { AuthGuard } from '../auth/guards/auth.guard';
import { NaviService } from './navi.service';

@Resolver()
export class NaviResolver {
	constructor(private readonly naviService: NaviService) {}

	/** Any signed-in member: the per-minute limit needs an id, and a guest has none. */
	@UseGuards(AuthGuard)
	@Query(() => NaviAnswer)
	public async askNavi(
		@Args('input') input: AskNaviInput,
		@AuthMember() authMember: AuthMemberType,
	): Promise<NaviAnswer> {
		console.log('Query: askNavi');
		return await this.naviService.ask(authMember._id, input.question);
	}
}
