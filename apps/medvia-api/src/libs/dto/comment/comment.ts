import { Field, InputType, Int, ObjectType } from '@nestjs/graphql';
import type { ObjectId } from 'mongoose';
import { IsEnum, IsInt, IsMongoId, IsOptional, Length, Max, Min } from 'class-validator';
import { CommentStatus } from '../../enums/comment.enum';
import { Language } from '../../enums/common.enum';
import { MemberType } from '../../enums/member.enum';
import { TotalCounter } from '../member/member';

@InputType()
export class CommentInput {
	@IsMongoId()
	@Field(() => String)
	articleId!: string;

	@Length(1, 2000)
	@Field(() => String)
	commentContent!: string;

	@IsEnum(Language)
	@Field(() => Language)
	commentLang!: Language;
}

@InputType()
export class CommentUpdate {
	@IsMongoId()
	@Field(() => String)
	commentId!: string;

	@Length(1, 2000)
	@Field(() => String)
	commentContent!: string;

	@IsOptional()
	@IsEnum(Language)
	@Field(() => Language, { nullable: true })
	commentLang?: Language;
}

/** The comments under one post, oldest first. */
@InputType()
export class CommentsInquiry {
	@IsMongoId()
	@Field(() => String)
	articleId!: string;

	@IsInt()
	@Min(1)
	@Field(() => Int)
	page!: number;

	@IsInt()
	@Min(1)
	@Max(100)
	@Field(() => Int)
	limit!: number;
}

@ObjectType()
export class Comment {
	@Field(() => String)
	_id!: ObjectId;

	@Field(() => CommentStatus)
	commentStatus!: CommentStatus;

	@Field(() => String)
	commentContent!: string;

	@Field(() => Language)
	commentLang!: Language;

	@Field(() => String)
	articleId!: ObjectId;

	@Field(() => String)
	memberId!: ObjectId;

	@Field(() => Date)
	createdAt!: Date;

	@Field(() => Date)
	updatedAt!: Date;

	@Field(() => String, { nullable: true })
	authorName?: string;

	/** DOCTOR: a doctor's answer, shown with the badge. */
	@Field(() => MemberType, { nullable: true })
	authorType?: MemberType;
}

@ObjectType()
export class Comments {
	@Field(() => [Comment])
	list!: Comment[];

	@Field(() => [TotalCounter], { nullable: true })
	metaCounter!: TotalCounter[];
}
