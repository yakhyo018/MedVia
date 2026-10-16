import { Field, Int, ObjectType } from '@nestjs/graphql';
import type { ObjectId } from 'mongoose';
import { MemberAuthType, MemberStatus, MemberType } from '../../enums/member.enum';
import { Language } from '../../enums/common.enum';
import { BookingStatus } from '../../enums/booking.enum';

@ObjectType()
export class NotifySettings {
	@Field(() => Boolean)
	bookingUpdates!: boolean;

	@Field(() => Boolean)
	visitReminders!: boolean;

	@Field(() => Boolean)
	chatMessages!: boolean;
}

@ObjectType()
export class Member {
	@Field(() => String)
	_id!: ObjectId;

	@Field(() => MemberType)
	memberType!: MemberType;

	@Field(() => MemberStatus)
	memberStatus!: MemberStatus;

	@Field(() => MemberAuthType)
	memberAuthType!: MemberAuthType;

	@Field(() => String)
	memberEmail!: string;

	// No @Field: never part of the GraphQL schema, so no query can ask for it.
	memberPassword?: string;

	memberGoogleId?: string;

	@Field(() => Boolean)
	memberMustChangePassword!: boolean;

	@Field(() => String)
	memberFullName!: string;

	@Field(() => String, { nullable: true })
	memberPhone?: string;

	@Field(() => String)
	memberImage!: string;

	@Field(() => String, { nullable: true })
	memberCountry?: string;

	@Field(() => Language)
	memberLang!: Language;

	@Field(() => NotifySettings)
	memberNotify!: NotifySettings;

	@Field(() => Date)
	memberTermsAt!: Date;

	@Field(() => Date, { nullable: true })
	memberLastLoginAt?: Date;

	/** Set while the member allows AI translation of their chat; null when withdrawn. */
	@Field(() => Date, { nullable: true })
	memberAiConsentAt?: Date;

	@Field(() => String, { nullable: true })
	memberAiConsentVersion?: string;

	@Field(() => Date, { nullable: true })
	deletedAt?: Date;

	@Field(() => Date)
	createdAt!: Date;

	@Field(() => Date)
	updatedAt!: Date;

	/** Only on signup, login and refresh. The refresh token travels in an httpOnly cookie instead. */
	@Field(() => String, { nullable: true })
	accessToken?: string;
}

@ObjectType()
export class TotalCounter {
	@Field(() => Int, { nullable: true })
	total?: number;
}

@ObjectType()
export class Members {
	@Field(() => [Member])
	list!: Member[];

	@Field(() => [TotalCounter], { nullable: true })
	metaCounter!: TotalCounter[];
}

/** One line of the admin's user detail: a booking without its medical data. */
@ObjectType()
export class MemberBookingRow {
	@Field(() => String)
	_id!: ObjectId;

	@Field(() => String)
	bookingCode!: string;

	@Field(() => BookingStatus)
	bookingStatus!: BookingStatus;

	@Field(() => Date)
	bookingDate!: Date;

	@Field(() => String, { nullable: true })
	clinicName?: string;

	@Field(() => String, { nullable: true })
	treatmentName?: string;
}

/** The admin's user detail: the account, what the member did, and their last bookings. */
@ObjectType()
export class MemberDetail {
	@Field(() => Member)
	member!: Member;

	@Field(() => Int)
	completedVisits!: number;

	@Field(() => Int)
	noShows!: number;

	/** Posts not deleted. */
	@Field(() => Int)
	posts!: number;

	/** Reports by others against this member's posts and comments. */
	@Field(() => Int)
	reportsAgainst!: number;

	/** The latest 10, newest visit first. */
	@Field(() => [MemberBookingRow])
	recentBookings!: MemberBookingRow[];
}
