import { UseGuards } from '@nestjs/common';
import { Args, Mutation, Resolver } from '@nestjs/graphql';
import type { ObjectId } from 'mongoose';
import { LikeService } from './like.service';
import { LikeResult, LikeTargetInput } from '../../libs/dto/like/like';
import { MemberType } from '../../libs/enums/member.enum';
import { AuthMember } from '../auth/decorators/authMember.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';

@Resolver()
export class LikeResolver {
	constructor(private readonly likeService: LikeService) {}

	/** Patients like; clinic and doctor accounts do not. */
	@Roles(MemberType.USER)
	@UseGuards(RolesGuard)
	@Mutation(() => LikeResult)
	public async likeTarget(
		@Args('input') input: LikeTargetInput,
		@AuthMember('_id') memberId: ObjectId,
	): Promise<LikeResult> {
		console.log('Mutation: likeTarget');
		return await this.likeService.likeTarget(memberId, input);
	}
}
