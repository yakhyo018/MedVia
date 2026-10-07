import { Field, InputType, Int, ObjectType } from '@nestjs/graphql';
import { IsEnum, IsMongoId } from 'class-validator';
import { LikeGroup } from '../../enums/like.enum';

/** One mutation for every likeable thing: a clinic, a doctor — articles and comments in M8. */
@InputType()
export class LikeTargetInput {
	@IsEnum(LikeGroup)
	@Field(() => LikeGroup)
	likeGroup!: LikeGroup;

	@IsMongoId()
	@Field(() => String)
	likeRefId!: string;
}

/** What the heart button needs after a click: its new state and the new count. */
@ObjectType()
export class LikeResult {
	@Field(() => LikeGroup)
	likeGroup!: LikeGroup;

	@Field(() => String)
	likeRefId!: string;

	@Field(() => Boolean)
	meLiked!: boolean;

	@Field(() => Int)
	likes!: number;
}
