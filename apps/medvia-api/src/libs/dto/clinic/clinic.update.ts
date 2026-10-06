import { Field, InputType } from '@nestjs/graphql';
import {
	ArrayMaxSize,
	ArrayUnique,
	IsArray,
	IsEnum,
	IsOptional,
	Length,
	Matches,
	ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { District, Specialty } from '../../enums/clinic.enum';
import { Language } from '../../enums/common.enum';
import { UPLOADED_IMAGE_PATTERN } from '../../config';
import { PHONE_PATTERN } from '../member/member.input';
import { ClinicHourInput, LocationInput } from './clinic.input';

/**
 * The clinic's own profile page. No clinicStatus, memberId or counters here: the GraphQL
 * schema rejects them before validation even runs.
 *
 * Once ACTIVE, the identity fields (name, Korean name, district, address, an existing pin)
 * are locked — they are what the admin verified. Changing them goes through support.
 */
@InputType()
export class ClinicUpdate {
	@IsOptional()
	@Length(2, 100)
	@Field(() => String, { nullable: true })
	clinicName?: string;

	@IsOptional()
	@Length(1, 100)
	@Field(() => String, { nullable: true })
	clinicNameKo?: string;

	@IsOptional()
	@IsEnum(Specialty)
	@Field(() => Specialty, { nullable: true })
	clinicSpecialty?: Specialty;

	@IsOptional()
	@IsEnum(District)
	@Field(() => District, { nullable: true })
	clinicDistrict?: District;

	@IsOptional()
	@Length(5, 200)
	@Field(() => String, { nullable: true })
	clinicAddress?: string;

	@IsOptional()
	@ValidateNested()
	@Type(() => LocationInput)
	@Field(() => LocationInput, { nullable: true })
	clinicLocation?: LocationInput;

	@IsOptional()
	@Matches(PHONE_PATTERN, { message: 'clinicPhone is not a valid phone number' })
	@Field(() => String, { nullable: true })
	clinicPhone?: string;

	/** Replaces the whole week. One row per day; the service checks open < close. */
	@IsOptional()
	@IsArray()
	@ArrayMaxSize(7)
	@ValidateNested({ each: true })
	@Type(() => ClinicHourInput)
	@Field(() => [ClinicHourInput], { nullable: true })
	clinicHours?: ClinicHourInput[];

	@IsOptional()
	@IsArray()
	@ArrayMaxSize(6)
	@ArrayUnique()
	@IsEnum(Language, { each: true })
	@Field(() => [Language], { nullable: true })
	clinicLangs?: Language[];

	@IsOptional()
	@IsArray()
	@ArrayMaxSize(6)
	@ArrayUnique()
	@IsEnum(Language, { each: true })
	@Field(() => [Language], { nullable: true })
	clinicInterpreterLangs?: Language[];

	@IsOptional()
	@Matches(UPLOADED_IMAGE_PATTERN, {
		message: 'clinicLogo must be a path returned by /upload/image',
	})
	@Field(() => String, { nullable: true })
	clinicLogo?: string;

	@IsOptional()
	@IsArray()
	@ArrayMaxSize(10)
	@ArrayUnique()
	@Matches(UPLOADED_IMAGE_PATTERN, {
		each: true,
		message: 'clinicImages must be paths returned by /upload/image',
	})
	@Field(() => [String], { nullable: true })
	clinicImages?: string[];

	@IsOptional()
	@Length(0, 2000)
	@Field(() => String, { nullable: true })
	clinicDesc?: string;
}
