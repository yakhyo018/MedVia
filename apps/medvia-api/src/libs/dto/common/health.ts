import { Field, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class Health {
	@Field(() => String)
	status!: string;

	@Field(() => String)
	mongo!: string;

	@Field(() => String)
	redis!: string;

	@Field(() => Date)
	time!: Date;
}
