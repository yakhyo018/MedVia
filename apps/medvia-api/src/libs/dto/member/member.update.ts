import { Field, InputType } from '@nestjs/graphql';
import {
	IsBoolean,
	IsEnum,
	IsISO31661Alpha2,
	IsMongoId,
	IsOptional,
	Length,
	Matches,
	ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { MemberStatus } from '../../enums/member.enum';
import { Language } from '../../enums/common.enum';
import { PHONE_PATTERN } from './member.input';

@InputType()
export class NotifySettingsInput {
	@IsOptional()
	@IsBoolean()
	@Field(() => Boolean, { nullable: true })
	bookingUpdates?: boolean;

	@IsOptional()
	@IsBoolean()
	@Field(() => Boolean, { nullable: true })
	visitReminders?: boolean;

	@IsOptional()
	@IsBoolean()
	@Field(() => Boolean, { nullable: true })
	chatMessages?: boolean;
}

/**
 * The member's own profile. There is deliberately no memberType, memberStatus or
 * memberEmail here: the GraphQL schema rejects them before validation even runs.
 */
@InputType()
export class MemberUpdate {
	@IsOptional()
	@Length(2, 60)
	@Field(() => String, { nullable: true })
	memberFullName?: string;

	@IsOptional()
	@Matches(PHONE_PATTERN, { message: 'memberPhone is not a valid phone number' })
	@Field(() => String, { nullable: true })
	memberPhone?: string;

	@IsOptional()
	@Length(0, 300)
	@Field(() => String, { nullable: true })
	memberImage?: string;

	@IsOptional()
	@IsISO31661Alpha2()
	@Field(() => String, { nullable: true })
	memberCountry?: string;

	@IsOptional()
	@IsEnum(Language)
	@Field(() => Language, { nullable: true })
	memberLang?: Language;

	@IsOptional()
	@ValidateNested()
	@Type(() => NotifySettingsInput)
	@Field(() => NotifySettingsInput, { nullable: true })
	memberNotify?: NotifySettingsInput;
}

@InputType()
export class MemberAdminUpdate {
	@IsMongoId()
	@Field(() => String)
	_id!: string;

	@IsEnum(MemberStatus)
	@Field(() => MemberStatus)
	memberStatus!: MemberStatus;
}
