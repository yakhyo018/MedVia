import { Field, InputType, Int } from '@nestjs/graphql';
import { IsInt, Max, Min } from 'class-validator';

/** A plain page of "my" things: favorites, recently visited. */
@InputType()
export class OrdinaryInquiry {
	@IsInt()
	@Min(1)
	@Field(() => Int)
	page!: number;

	@IsInt()
	@Min(1)
	@Max(50)
	@Field(() => Int)
	limit!: number;
}
