import { Field, InputType, Int } from '@nestjs/graphql';
import {
	Equals,
	IsBoolean,
	IsEmail,
	IsEnum,
	IsIn,
	IsInt,
	IsISO31661Alpha2,
	IsNotEmpty,
	IsOptional,
	Length,
	Matches,
	Max,
	Min,
	ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { MemberStatus, MemberType, SIGNUP_MEMBER_TYPES } from '../../enums/member.enum';
import { Direction, Language } from '../../enums/common.enum';
import { availableMemberSorts } from '../../config';

/**
 * bcrypt only reads the first 72 bytes of a password; anything after is silently
 * ignored, so two passwords that differ only past byte 72 would match each other.
 */
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 72;
export const PHONE_PATTERN = /^\+?[0-9][0-9 ()-]{5,19}$/;

@InputType()
export class MemberInput {
	@IsIn(SIGNUP_MEMBER_TYPES, { message: 'memberType must be USER or AGENT' })
	@Field(() => MemberType)
	memberType!: MemberType;

	@IsEmail()
	@Field(() => String)
	memberEmail!: string;

	@Length(PASSWORD_MIN, PASSWORD_MAX)
	@Field(() => String)
	memberPassword!: string;

	@Length(2, 60)
	@Field(() => String)
	memberFullName!: string;

	@IsOptional()
	@Matches(PHONE_PATTERN, { message: 'memberPhone is not a valid phone number' })
	@Field(() => String, { nullable: true })
	memberPhone?: string;

	@IsOptional()
	@IsISO31661Alpha2()
	@Field(() => String, { nullable: true })
	memberCountry?: string;

	@IsEnum(Language)
	@Field(() => Language)
	memberLang!: Language;

	@Equals(true, { message: 'termsAccepted must be true' })
	@Field(() => Boolean)
	termsAccepted!: boolean;
}

@InputType()
export class LoginInput {
	@IsEmail()
	@Field(() => String)
	memberEmail!: string;

	@IsNotEmpty()
	@Field(() => String)
	memberPassword!: string;
}

@InputType()
export class GoogleLoginInput {
	@IsNotEmpty()
	@Field(() => String)
	idToken!: string;

	/** Used only when this Google account signs in for the first time. */
	@IsOptional()
	@IsIn(SIGNUP_MEMBER_TYPES, { message: 'memberType must be USER or AGENT' })
	@Field(() => MemberType, { nullable: true })
	memberType?: MemberType;

	@IsOptional()
	@IsEnum(Language)
	@Field(() => Language, { nullable: true })
	memberLang?: Language;

	@IsOptional()
	@IsBoolean()
	@Field(() => Boolean, { nullable: true })
	termsAccepted?: boolean;
}

@InputType()
export class ChangePasswordInput {
	/** Required whenever the account already has a password. */
	@IsOptional()
	@IsNotEmpty()
	@Field(() => String, { nullable: true })
	currentPassword?: string;

	@Length(PASSWORD_MIN, PASSWORD_MAX)
	@Field(() => String)
	newPassword!: string;
}

@InputType()
class MISearch {
	@IsOptional()
	@IsEnum(MemberType)
	@Field(() => MemberType, { nullable: true })
	memberType?: MemberType;

	@IsOptional()
	@IsEnum(MemberStatus)
	@Field(() => MemberStatus, { nullable: true })
	memberStatus?: MemberStatus;

	/** Matches email or full name, case-insensitive. */
	@IsOptional()
	@Length(1, 100)
	@Field(() => String, { nullable: true })
	text?: string;
}

@InputType()
export class MembersInquiry {
	@IsInt()
	@Min(1)
	@Field(() => Int)
	page!: number;

	@IsInt()
	@Min(1)
	@Max(100)
	@Field(() => Int)
	limit!: number;

	@IsOptional()
	@IsIn(availableMemberSorts)
	@Field(() => String, { nullable: true })
	sort?: string;

	@IsOptional()
	@IsEnum(Direction)
	@Field(() => Direction, { nullable: true })
	direction?: Direction;

	@IsOptional()
	@ValidateNested()
	@Type(() => MISearch)
	@Field(() => MISearch, { nullable: true })
	search?: MISearch;
}
