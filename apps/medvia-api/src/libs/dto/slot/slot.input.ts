import { Field, InputType, Int } from '@nestjs/graphql';
import {
	ArrayMaxSize,
	ArrayMinSize,
	ArrayUnique,
	IsArray,
	IsBoolean,
	IsDate,
	IsInt,
	IsMongoId,
	IsOptional,
	Length,
	Matches,
	Max,
	Min,
} from 'class-validator';
import { Type } from 'class-transformer';

/** A Seoul calendar date. Dates of the schedule are wall-clock days, not instants. */
export const SEOUL_DATE_PATTERN = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

/** Slot times sit on the half-hour grid. */
const GRID_TIME_PATTERN = /^([01]\d|2[0-3]):(00|30)$/;

/**
 * "Add slots": one doctor, a date range and a daily window, all in Seoul time. Only the parts
 * inside the clinic's opening hours become slots; existing slots are left as they are.
 */
@InputType()
export class SlotsCreateInput {
	@IsMongoId()
	@Field(() => String)
	doctorId!: string;

	@Matches(SEOUL_DATE_PATTERN, { message: 'dateFrom must be YYYY-MM-DD' })
	@Field(() => String)
	dateFrom!: string;

	@Matches(SEOUL_DATE_PATTERN, { message: 'dateTo must be YYYY-MM-DD' })
	@Field(() => String)
	dateTo!: string;

	@Matches(GRID_TIME_PATTERN, { message: 'timeFrom must be HH:00 or HH:30' })
	@Field(() => String)
	timeFrom!: string;

	@Matches(GRID_TIME_PATTERN, { message: 'timeTo must be HH:00 or HH:30' })
	@Field(() => String)
	timeTo!: string;

	/** Weekdays to fill, 0 = Sunday. Empty or absent: every day the clinic is open. */
	@IsOptional()
	@IsArray()
	@ArrayMaxSize(7)
	@ArrayUnique()
	@IsInt({ each: true })
	@Min(0, { each: true })
	@Max(6, { each: true })
	@Field(() => [Int], { nullable: true })
	days?: number[];
}

/** "Block time" and its undo: only free slots are blocked, only blocked ones reopen. */
@InputType()
export class SlotsBlockInput {
	@IsArray()
	@ArrayMinSize(1)
	@ArrayMaxSize(100)
	@ArrayUnique()
	@IsMongoId({ each: true })
	@Field(() => [String])
	slotIds!: string[];

	@IsBoolean()
	@Field(() => Boolean)
	blocked!: boolean;

	@IsOptional()
	@Length(1, 100)
	@Field(() => String, { nullable: true })
	slotBlockReason?: string;
}

/** The clinic's week: seven days from dateFrom, one doctor or all. */
@InputType()
export class ClinicScheduleInquiry {
	@Matches(SEOUL_DATE_PATTERN, { message: 'dateFrom must be YYYY-MM-DD' })
	@Field(() => String)
	dateFrom!: string;

	@IsOptional()
	@IsMongoId()
	@Field(() => String, { nullable: true })
	doctorId?: string;
}

/** The time picker of the booking page: one treatment, one doctor, one Seoul day. */
@InputType()
export class AvailableSlotsInquiry {
	@IsMongoId()
	@Field(() => String)
	treatmentId!: string;

	@IsMongoId()
	@Field(() => String)
	doctorId!: string;

	@Matches(SEOUL_DATE_PATTERN, { message: 'date must be YYYY-MM-DD' })
	@Field(() => String)
	date!: string;
}

/** Step 1 of the booking: the patient picked a time; hold it for 10 minutes. */
@InputType()
export class SlotHoldInput {
	@IsMongoId()
	@Field(() => String)
	treatmentId!: string;

	@IsMongoId()
	@Field(() => String)
	doctorId!: string;

	/** One of the times getAvailableSlots returned. */
	@IsDate()
	@Type(() => Date)
	@Field(() => Date)
	slotStart!: Date;
}
