import { UseGuards } from '@nestjs/common';
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { CommentService } from './comment.service';
import {
	Comment,
	CommentInput,
	Comments,
	CommentsInquiry,
	CommentUpdate,
} from '../../libs/dto/comment/comment';
import { MemberType } from '../../libs/enums/member.enum';
import type { AuthMember as AuthMemberType } from '../../libs/types/common';
import { AuthMember } from '../auth/decorators/authMember.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';

/** Patients and doctors comment; a clinic account does not join the conversation. */
const COMMENTERS = [MemberType.USER, MemberType.DOCTOR];

@Resolver()
export class CommentResolver {
	constructor(private readonly commentService: CommentService) {}

	@Roles(...COMMENTERS)
	@UseGuards(RolesGuard)
	@Mutation(() => Comment)
	public async createComment(
		@Args('input') input: CommentInput,
		@AuthMember() authMember: AuthMemberType,
	): Promise<Comment> {
		console.log('Mutation: createComment');
		return await this.commentService.createComment(authMember, input);
	}

	@Roles(...COMMENTERS)
	@UseGuards(RolesGuard)
	@Mutation(() => Comment)
	public async updateComment(
		@Args('input') input: CommentUpdate,
		@AuthMember() authMember: AuthMemberType,
	): Promise<Comment> {
		console.log('Mutation: updateComment');
		return await this.commentService.updateComment(authMember, input);
	}

	@Roles(...COMMENTERS)
	@UseGuards(RolesGuard)
	@Mutation(() => Comment)
	public async removeComment(
		@Args('commentId') commentId: string,
		@AuthMember() authMember: AuthMemberType,
	): Promise<Comment> {
		console.log('Mutation: removeComment');
		return await this.commentService.removeComment(authMember, commentId);
	}

	/** PUBLIC **/

	@Query(() => Comments)
	public async getComments(@Args('input') input: CommentsInquiry): Promise<Comments> {
		console.log('Query: getComments');
		return await this.commentService.getComments(input);
	}
}
