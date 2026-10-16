import { Field, InputType, Int, ObjectType } from '@nestjs/graphql';
import type { ObjectId } from 'mongoose';
import { IsMongoId, IsOptional, IsString, Length } from 'class-validator';
import { AssistantSessionStatus } from '../../enums/assistant.enum';
import { Language } from '../../enums/common.enum';

@InputType()
export class AssistantMessageInput {
	@IsString()
	@Length(1, 1000)
	@Field(() => String)
	text!: string;

	/** Continue this conversation; without it, the member's active one (or a new one). */
	@IsOptional()
	@IsMongoId()
	@Field(() => String, { nullable: true })
	sessionId?: string;
}

/** A clinic the assistant found this turn — a card the app can render and link. */
@ObjectType()
export class AssistantClinicCard {
	@Field(() => String)
	clinicId!: string;

	@Field(() => String)
	clinicName!: string;

	@Field(() => String, { nullable: true })
	district?: string;

	@Field(() => Number, { nullable: true })
	rating?: number;

	@Field(() => Int, { nullable: true })
	minPriceKrw?: number;
}

/** A free time the assistant found this turn. */
@ObjectType()
export class AssistantSlotOption {
	@Field(() => String)
	treatmentId!: string;

	@Field(() => String)
	doctorId!: string;

	@Field(() => Date)
	slotStart!: Date;

	/** "Tue 14 Oct · 10:00 KST". */
	@Field(() => String)
	label!: string;
}

/** The proposed time, waiting for the patient's Confirm. */
@ObjectType()
export class AssistantHold {
	@Field(() => String)
	treatmentId!: ObjectId;

	@Field(() => String)
	doctorId!: ObjectId;

	@Field(() => Date)
	slotStart!: Date;

	@Field(() => String, { nullable: true })
	label?: string;

	@Field(() => String, { nullable: true })
	clinicName?: string;

	@Field(() => String, { nullable: true })
	treatmentName?: string;

	@Field(() => Int, { nullable: true })
	priceKrw?: number;

	@Field(() => Date)
	expiresAt!: Date;
}

@ObjectType()
export class AssistantReply {
	@Field(() => String)
	sessionId!: string;

	@Field(() => String)
	text!: string;

	@Field(() => [AssistantClinicCard])
	clinics!: AssistantClinicCard[];

	@Field(() => [AssistantSlotOption])
	slots!: AssistantSlotOption[];

	@Field(() => AssistantHold, { nullable: true })
	pendingHold?: AssistantHold;

	/** The tools that ran this turn, in order — for the app's "searching clinics…" hints. */
	@Field(() => [String])
	toolsUsed!: string[];
}

/** One line of the conversation as the patient sees it: no tool calls, no raw replies. */
@ObjectType()
export class AssistantTurnView {
	@Field(() => String)
	role!: string;

	@Field(() => String)
	text!: string;
}

@ObjectType()
export class AssistantSessionView {
	@Field(() => String)
	_id!: ObjectId;

	@Field(() => AssistantSessionStatus)
	sessionStatus!: AssistantSessionStatus;

	@Field(() => Language)
	sessionLang!: Language;

	@Field(() => [AssistantTurnView])
	turns!: AssistantTurnView[];

	@Field(() => AssistantHold, { nullable: true })
	pendingHold?: AssistantHold;

	@Field(() => Int)
	turnCount!: number;
}
