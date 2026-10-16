import { Field, Int, ObjectType } from '@nestjs/graphql';
import type { ObjectId } from 'mongoose';
import { BoardArticleCategory, BoardArticleStatus } from '../../enums/board-article.enum';
import { Language } from '../../enums/common.enum';
import { MemberType } from '../../enums/member.enum';
import { TotalCounter } from '../member/member';

@ObjectType()
export class BoardArticle {
	@Field(() => String)
	_id!: ObjectId;

	@Field(() => BoardArticleCategory)
	articleCategory!: BoardArticleCategory;

	@Field(() => BoardArticleStatus)
	articleStatus!: BoardArticleStatus;

	@Field(() => String)
	articleTitle!: string;

	@Field(() => String)
	articleContent!: string;

	/** Health tips only; posts saved before photos existed have none (the field is missing). */
	@Field(() => [String], { nullable: true })
	articleImages?: string[];

	@Field(() => Language)
	articleLang!: Language;

	@Field(() => Boolean)
	articleAnswered!: boolean;

	@Field(() => Int)
	articleLikes!: number;

	@Field(() => Int)
	articleViews!: number;

	@Field(() => Int)
	articleComments!: number;

	/** The admin's lists only; public queries leave it out. */
	@Field(() => Int, { nullable: true })
	articleReports?: number;

	@Field(() => String)
	memberId!: ObjectId;

	@Field(() => Date)
	createdAt!: Date;

	@Field(() => Date)
	updatedAt!: Date;

	/** "Feride K.", "Dr. Han Seo-yeon" or "MedVia". */
	@Field(() => String, { nullable: true })
	authorName?: string;

	/** DOCTOR shows the doctor badge. */
	@Field(() => MemberType, { nullable: true })
	authorType?: MemberType;

	/** Whether the signed-in viewer liked it; null for guests. */
	@Field(() => Boolean, { nullable: true })
	meLiked?: boolean;
}

@ObjectType()
export class BoardArticles {
	@Field(() => [BoardArticle])
	list!: BoardArticle[];

	@Field(() => [TotalCounter], { nullable: true })
	metaCounter!: TotalCounter[];
}
