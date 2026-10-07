import { Field, Int, ObjectType } from '@nestjs/graphql';
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
