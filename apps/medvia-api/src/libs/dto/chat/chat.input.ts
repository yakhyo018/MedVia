import { Field, InputType, Int } from '@nestjs/graphql';
import { IsEnum, IsInt, IsMongoId, IsOptional, Length, Max, Min } from 'class-validator';
import { Language } from '../../enums/common.enum';

/** One page of a room's history, newest first; `before` is the nextCursor of the previous page. */
@InputType()
export class RoomMessagesInquiry {
	@IsMongoId()
	@Field(() => String)
	roomId!: string;

	@IsOptional()
	@Length(1, 200)
	@Field(() => String, { nullable: true })
	before?: string;

	@IsInt()
	@Min(1)
	@Max(50)
	@Field(() => Int)
	limit!: number;
}

/** "Write in any language…" — or, for the clinic, in Korean. */
@InputType()
export class MessageSendInput {
	@IsMongoId()
	@Field(() => String)
	roomId!: string;

	@Length(1, 2000)
	@Field(() => String)
	messageText!: string;

	/** The patient's pick in the message box; their profile language when left out. The clinic always writes Korean. */
	@IsOptional()
	@IsEnum(Language)
	@Field(() => Language, { nullable: true })
	messageLang?: Language;
}
