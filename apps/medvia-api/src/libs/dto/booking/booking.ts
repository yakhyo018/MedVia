import { Field, Float, Int, ObjectType } from '@nestjs/graphql';
import type { ObjectId } from 'mongoose';
import { BookingActor, BookingConsentType, BookingStatus } from '../../enums/booking.enum';
import { Language } from '../../enums/common.enum';
import { TotalCounter } from '../member/member';
import { Clinic } from '../clinic/clinic';
import { Doctor } from '../doctor/doctor';
import { Treatment } from '../treatment/treatment';

@ObjectType()
export class QuestionAnswer {
	@Field(() => String)
	question!: string;

	@Field(() => String)
	answer!: string;
}

/** Decrypted on the way out, for the patient, the clinic and the doctor of the booking only. */
@ObjectType()
export class BookingQuestionnaire {
	@Field(() => [QuestionAnswer])
	answers!: QuestionAnswer[];

	@Field(() => Language)
	originalLang!: Language;
}

@ObjectType()
export class ConsentSnapshot {
	@Field(() => BookingConsentType)
	consentType!: BookingConsentType;

	@Field(() => Boolean)
	agreed!: boolean;

	@Field(() => String)
	version!: string;

	@Field(() => Date)
	agreedAt!: Date;
}

@ObjectType()
export class StatusChange {
	@Field(() => BookingStatus)
	status!: BookingStatus;

	@Field(() => String, { nullable: true })
	changedBy?: ObjectId;

	@Field(() => String, { nullable: true })
	reason?: string;

	@Field(() => Date)
	changedAt!: Date;
}

@ObjectType()
export class Booking {
	@Field(() => String)
	_id!: ObjectId;

	@Field(() => String)
	bookingCode!: string;

	/** Effective: a request past its deadline is EXPIRED even before anything wrote it. */
	@Field(() => BookingStatus)
	bookingStatus!: BookingStatus;

	@Field(() => Date)
	bookingDate!: Date;

	@Field(() => Int)
	bookingPrice!: number;

	@Field(() => Language)
	bookingLang!: Language;

	@Field(() => Language, { nullable: true })
	bookingInterpreter?: Language;

	/** Only on getBooking — lists never decrypt. */
	@Field(() => BookingQuestionnaire, { nullable: true })
	bookingQuestionnaire?: BookingQuestionnaire;

	/** "AI summary · 한국어" — not a diagnosis. Same readers as the questionnaire. */
	@Field(() => String, { nullable: true })
	bookingAiSummary?: string;

	@Field(() => [ConsentSnapshot])
	bookingConsents!: ConsentSnapshot[];

	@Field(() => [StatusChange])
	bookingHistory!: StatusChange[];

	@Field(() => String, { nullable: true })
	bookingDeclineReason?: string;

	@Field(() => BookingActor, { nullable: true })
	cancelledBy?: BookingActor;

	@Field(() => Date)
	respondDeadline!: Date;

	@Field(() => Date, { nullable: true })
	completedAt?: Date;

	@Field(() => Boolean, { nullable: true })
	bookingReviewed?: boolean;

	@Field(() => String)
	memberId!: ObjectId;

	@Field(() => String)
	clinicId!: ObjectId;

	@Field(() => String)
	doctorId!: ObjectId;

	@Field(() => String)
	treatmentId!: ObjectId;

	@Field(() => [String])
	slotIds!: ObjectId[];

	@Field(() => Date)
	createdAt!: Date;

	@Field(() => Date)
	updatedAt!: Date;

	/** The patient's full name — shared with the clinic under the SHARE_DATA consent. */
	@Field(() => String, { nullable: true })
	patientName?: string;

	@Field(() => Clinic, { nullable: true })
	clinicData?: Clinic;

	@Field(() => Doctor, { nullable: true })
	doctorData?: Doctor;

	@Field(() => Treatment, { nullable: true })
	treatmentData?: Treatment;
}

@ObjectType()
export class Bookings {
	@Field(() => [Booking])
	list!: Booking[];

	@Field(() => [TotalCounter], { nullable: true })
	metaCounter!: TotalCounter[];
}

@ObjectType()
export class DayCount {
	/** A Seoul calendar date, "2026-10-11". */
	@Field(() => String)
	date!: string;

	@Field(() => Int)
	count!: number;
}

@ObjectType()
export class LanguageShare {
	@Field(() => Language)
	lang!: Language;

	@Field(() => Int)
	count!: number;

	/** 0 … 1, rounded to three decimals. */
	@Field(() => Float)
	share!: number;
}

/** The booking cards of the admin dashboard. */
@ObjectType()
export class BookingStats {
	/** Requests sent today (Seoul). */
	@Field(() => Int)
	today!: number;

	/** PENDING, the clinic's deadline still ahead. */
	@Field(() => Int)
	waitingForClinic!: number;

	/** Requests per Seoul day, oldest first, days without any included as 0. */
	@Field(() => [DayCount])
	last14Days!: DayCount[];

	/** The patients' languages over the last 30 days, largest first. */
	@Field(() => [LanguageShare])
	languages!: LanguageShare[];
}
