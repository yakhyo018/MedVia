import { Field, InputType, Int } from '@nestjs/graphql';
import {
	ArrayMaxSize,
	ArrayMinSize,
	IsArray,
	IsBoolean,
	IsDate,
	IsEnum,
	IsInt,
	IsMongoId,
	IsOptional,
	Length,
	Max,
	Min,
	ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { BookingConsentType, BookingStatus, BookingTab } from '../../enums/booking.enum';
import { Language } from '../../enums/common.enum';

@InputType()
export class QuestionAnswerInput {
	@Length(1, 200)
	@Field(() => String)
	question!: string;

	@Length(0, 2000)
	@Field(() => String)
	answer!: string;
}

/** "Tell the doctor about your concern" — answered in any language, stored encrypted. */
@InputType()
export class QuestionnaireInput {
	@IsArray()
	@ArrayMinSize(1)
	@ArrayMaxSize(15)
	@ValidateNested({ each: true })
	@Type(() => QuestionAnswerInput)
	@Field(() => [QuestionAnswerInput])
	answers!: QuestionAnswerInput[];

	@IsEnum(Language)
	@Field(() => Language)
	originalLang!: Language;
}

/** One checkbox. The version and the time are stamped by the server. */
@InputType()
export class ConsentInput {
	@IsEnum(BookingConsentType)
	@Field(() => BookingConsentType)
	consentType!: BookingConsentType;

	@IsBoolean()
	@Field(() => Boolean)
	agreed!: boolean;
}

/**
 * "Send booking request". The slots are the ones this patient holds for this doctor from
 * slotStart on; the server finds them, the client never names slot ids.
 */
@InputType()
export class BookingCreateInput {
	@IsMongoId()
	@Field(() => String)
	treatmentId!: string;

	@IsMongoId()
	@Field(() => String)
	doctorId!: string;

	@IsDate()
	@Type(() => Date)
	@Field(() => Date)
	slotStart!: Date;

	/** The language the patient speaks at the visit. */
	@IsEnum(Language)
	@Field(() => Language)
	bookingLang!: Language;

	/** Interpreter language, when the clinic offers one. */
	@IsOptional()
	@IsEnum(Language)
	@Field(() => Language, { nullable: true })
	bookingInterpreter?: Language;

	@ValidateNested()
	@Type(() => QuestionnaireInput)
	@Field(() => QuestionnaireInput)
	questionnaire!: QuestionnaireInput;

	@IsArray()
	@ArrayMaxSize(5)
	@ValidateNested({ each: true })
	@Type(() => ConsentInput)
	@Field(() => [ConsentInput])
	consents!: ConsentInput[];
}

/**
 * One list for every role. Who sees which bookings comes from the token; the filters here
 * only narrow that set further.
 */
@InputType()
export class BookingsInquiry {
	@IsInt()
	@Min(1)
	@Field(() => Int)
	page!: number;

	@IsInt()
	@Min(1)
	@Max(50)
	@Field(() => Int)
	limit!: number;

	/** The patient's "My Bookings" tabs. */
	@IsOptional()
	@IsEnum(BookingTab)
	@Field(() => BookingTab, { nullable: true })
	tab?: BookingTab;

	@IsOptional()
	@IsEnum(BookingStatus)
	@Field(() => BookingStatus, { nullable: true })
	bookingStatus?: BookingStatus;

	@IsOptional()
	@IsMongoId()
	@Field(() => String, { nullable: true })
	doctorId?: string;

	@IsOptional()
	@IsMongoId()
	@Field(() => String, { nullable: true })
	clinicId?: string;
}

/**
 * Every status change — confirm, decline, complete, no-show, cancel — through one mutation.
 * Whether it is allowed depends on the current status, the caller's role and the time
 * (TRANSITIONS in booking.rules.ts).
 */
@InputType()
export class BookingStatusUpdate {
	@IsMongoId()
	@Field(() => String)
	bookingId!: string;

	@IsEnum(BookingStatus)
	@Field(() => BookingStatus)
	bookingStatus!: BookingStatus;

	/** Required to decline, and for a clinic's or admin's cancel. */
	@IsOptional()
	@Length(1, 500)
	@Field(() => String, { nullable: true })
	reason?: string;
}
