import { Field, Int, ObjectType } from '@nestjs/graphql';
import type { ObjectId } from 'mongoose';
import { MessageType, SenderType, TranslationStatus } from '../../enums/chat.enum';
import { Language } from '../../enums/common.enum';

@ObjectType()
export class MessageTranslation {
	@Field(() => Language)
	lang!: Language;

	@Field(() => String)
	text!: string;
}

@ObjectType()
export class ChatMessage {
	@Field(() => String)
	_id!: ObjectId;

	@Field(() => MessageType)
	messageType!: MessageType;

	@Field(() => SenderType)
	senderType!: SenderType;

	/** As written — "Show original". */
	@Field(() => String)
	messageText!: string;

	@Field(() => Language)
	messageLang!: Language;

	@Field(() => [MessageTranslation])
	messageTranslations!: MessageTranslation[];

	@Field(() => TranslationStatus)
	messageTranslationStatus!: TranslationStatus;

	/** What this viewer reads: the original in their language, or its translation. */
	@Field(() => String, { nullable: true })
	displayText?: string;

	@Field(() => String)
	roomId!: ObjectId;

	@Field(() => String, { nullable: true })
	senderId?: ObjectId;

	@Field(() => Date)
	createdAt!: Date;
}

@ObjectType()
export class ChatMessages {
	/** Newest first. */
	@Field(() => [ChatMessage])
	list!: ChatMessage[];

	/** Pass as `before` for the next (older) page; null when there is none. */
	@Field(() => String, { nullable: true })
	nextCursor?: string | null;
}

/** A row of "Consultation Chat" (patient) or "Consultations" (clinic), seen by one side. */
@ObjectType()
export class ChatRoom {
	@Field(() => String)
	_id!: ObjectId;

	@Field(() => Date)
	roomLastAt!: Date;

	/** Unread for the viewer. */
	@Field(() => Int)
	unread!: number;

	/** The last message in the viewer's language. */
	@Field(() => String, { nullable: true })
	lastText?: string;

	@Field(() => String)
	memberId!: ObjectId;

	@Field(() => String)
	clinicId!: ObjectId;

	@Field(() => String, { nullable: true })
	clinicName?: string;

	@Field(() => String, { nullable: true })
	clinicLogo?: string;

	/** "Feride K." — for the clinic's list. */
	@Field(() => String, { nullable: true })
	patientName?: string;

	/** "writes in Русский". */
	@Field(() => Language, { nullable: true })
	patientLang?: Language;
}
