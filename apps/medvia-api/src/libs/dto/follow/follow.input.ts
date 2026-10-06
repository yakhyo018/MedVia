import { Field, InputType, Int } from '@nestjs/graphql';
import { IsIn, IsInt, IsMongoId, IsOptional, Max, Min } from 'class-validator';
import { FOLLOWABLE_MEMBER_TYPES, MemberType } from '../../enums/member.enum';

@InputType()
export class FollowInput {
	/** The member to follow. For a clinic, its AGENT account: `clinic.memberId`. */
	@IsMongoId()
	@Field(() => String)
	memberId!: string;
}

@InputType()
export class FollowingsInquiry {
	@IsInt()
	@Min(1)
	@Field(() => Int)
	page!: number;

	@IsInt()
	@Min(1)
	@Max(50)
	@Field(() => Int)
	limit!: number;

	/** One tab; all tabs when omitted. */
	@IsOptional()
	@IsIn(FOLLOWABLE_MEMBER_TYPES)
	@Field(() => MemberType, { nullable: true })
	followingType?: MemberType;
}
