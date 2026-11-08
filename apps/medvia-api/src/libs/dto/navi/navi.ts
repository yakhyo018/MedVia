import { Field, InputType, Int, ObjectType } from '@nestjs/graphql';
import { IsString, Length } from 'class-validator';

/** A question to Navi, MedVia's RAG service. Navi itself allows 2–500 characters. */
@InputType()
export class AskNaviInput {
	@IsString()
	@Length(2, 500)
	@Field(() => String)
	question!: string;
}

/** One passage Navi answered from. `url` is a page on the site, when the source has one. */
@ObjectType()
export class NaviSource {
	@Field(() => Int)
	index!: number;

	@Field(() => String)
	docId!: string;

	@Field(() => String)
	title!: string;

	@Field(() => String)
	heading!: string;

	/** The model wrote [index] in the answer. */
	@Field(() => Boolean)
	cited!: boolean;

	@Field(() => String, { nullable: true })
	url?: string;
}

@ObjectType()
export class NaviAnswer {
	@Field(() => String)
	answer!: string;

	/** "I don't have that information" — nothing in MedVia's content answered it. */
	@Field(() => Boolean)
	refused!: boolean;

	@Field(() => [NaviSource])
	sources!: NaviSource[];

	/** Not medical advice — shown under every answer. */
	@Field(() => String)
	disclaimer!: string;
}
