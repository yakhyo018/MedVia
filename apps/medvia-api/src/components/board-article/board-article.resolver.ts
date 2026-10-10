import { UseGuards } from '@nestjs/common';
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { BoardArticleService } from './board-article.service';
import { BoardArticle, BoardArticles } from '../../libs/dto/board-article/board-article';
import {
	AdminArticlesInquiry,
	ArticleInput,
	ArticlesInquiry,
	ArticleUpdate,
} from '../../libs/dto/board-article/board-article.input';
import { MemberType } from '../../libs/enums/member.enum';
import type { AuthMember as AuthMemberType } from '../../libs/types/common';
import { AuthMember } from '../auth/decorators/authMember.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { WithoutGuard } from '../auth/guards/without.guard';

/** Patients, doctors and the team write; which board each may use is checked in the service. */
const WRITERS = [MemberType.USER, MemberType.DOCTOR, MemberType.ADMIN];

@Resolver()
export class BoardArticleResolver {
	constructor(private readonly articleService: BoardArticleService) {}

	@Roles(...WRITERS)
	@UseGuards(RolesGuard)
	@Mutation(() => BoardArticle)
	public async createArticle(
		@Args('input') input: ArticleInput,
		@AuthMember() authMember: AuthMemberType,
	): Promise<BoardArticle> {
		console.log('Mutation: createArticle');
		return await this.articleService.createArticle(authMember, input);
	}

	@Roles(...WRITERS)
	@UseGuards(RolesGuard)
	@Mutation(() => BoardArticle)
	public async updateArticle(
		@Args('input') input: ArticleUpdate,
		@AuthMember() authMember: AuthMemberType,
	): Promise<BoardArticle> {
		console.log('Mutation: updateArticle');
		return await this.articleService.updateArticle(authMember, input);
	}

	@Roles(...WRITERS)
	@UseGuards(RolesGuard)
	@Mutation(() => BoardArticle)
	public async removeArticle(
		@Args('articleId') articleId: string,
		@AuthMember() authMember: AuthMemberType,
	): Promise<BoardArticle> {
		console.log('Mutation: removeArticle');
		return await this.articleService.removeArticle(authMember, articleId);
	}

	/** PUBLIC — a signed-in viewer also gets meLiked and counts as a view. */

	@UseGuards(WithoutGuard)
	@Query(() => BoardArticle)
	public async getArticle(
		@Args('articleId') articleId: string,
		@AuthMember() authMember: AuthMemberType | null,
	): Promise<BoardArticle> {
		console.log('Query: getArticle');
		return await this.articleService.getArticle(authMember, articleId);
	}

	@UseGuards(WithoutGuard)
	@Query(() => BoardArticles)
	public async getArticles(
		@Args('input') input: ArticlesInquiry,
		@AuthMember() authMember: AuthMemberType | null,
	): Promise<BoardArticles> {
		console.log('Query: getArticles');
		return await this.articleService.getArticles(authMember, input);
	}

	/** ADMIN **/

	@Roles(MemberType.ADMIN)
	@UseGuards(RolesGuard)
	@Query(() => BoardArticles)
	public async getArticlesByAdmin(
		@Args('input') input: AdminArticlesInquiry,
	): Promise<BoardArticles> {
		console.log('Query: getArticlesByAdmin');
		return await this.articleService.getArticlesByAdmin(input);
	}
}
