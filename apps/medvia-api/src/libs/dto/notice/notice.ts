import { Field, InputType, Int, ObjectType } from '@nestjs/graphql';
import type { ObjectId } from 'mongoose';
import {
	ArrayMaxSize,
	IsArray,
	IsBoolean,
	IsEnum,
	IsIn,
	IsInt,
	IsMongoId,
	IsOptional,
	Length,
	Max,
	Min,
	ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { Language } from '../../enums/common.enum';
import { InquiryCategory } from '../../enums/inquiry.enum';
import { NoticeCategory, NoticeStatus } from '../../enums/notice.enum';
import { TotalCounter } from '../member/member';

@InputType()
export class NoticeTranslationInput {
	@IsEnum(Language)
	@Field(() => Language)
	lang!: Language;

	@Length(2, 200)
	@Field(() => String)
	title!: string;

	@Length(1, 10000)
	@Field(() => String)
	content!: string;
}

/** "New notice" / "New FAQ" — English base text, translations by hand. */
@InputType()
export class NoticeInput {
	@IsEnum(NoticeCategory)
	@Field(() => NoticeCategory)
	noticeCategory!: NoticeCategory;

	@IsOptional()
	@IsEnum(InquiryCategory)
	@Field(() => InquiryCategory, { nullable: true })
	noticeFaqCategory?: InquiryCategory;

	@IsOptional()
	@IsBoolean()
	@Field(() => Boolean, { nullable: true })
	noticePinned?: boolean;

	@Length(2, 200)
	@Field(() => String)
	noticeTitle!: string;

	@Length(1, 10000)
	@Field(() => String)
	noticeContent!: string;

	@IsOptional()
	@IsArray()
	@ArrayMaxSize(6)
	@ValidateNested({ each: true })
	@Type(() => NoticeTranslationInput)
	@Field(() => [NoticeTranslationInput], { nullable: true })
	noticeTranslations?: NoticeTranslationInput[];

	/** HOLD ("Save draft", the default) or ACTIVE ("Publish"); deleting has its own mutation. */
	@IsOptional()
	@IsIn([NoticeStatus.HOLD, NoticeStatus.ACTIVE])
	@Field(() => NoticeStatus, { nullable: true })
	noticeStatus?: NoticeStatus;
}

@InputType()
export class NoticeUpdate {
	@IsMongoId()
	@Field(() => String)
	noticeId!: string;

	@IsOptional()
	@IsBoolean()
	@Field(() => Boolean, { nullable: true })
	noticePinned?: boolean;

	@IsOptional()
	@Length(2, 200)
	@Field(() => String, { nullable: true })
	noticeTitle?: string;

	@IsOptional()
	@Length(1, 10000)
	@Field(() => String, { nullable: true })
	noticeContent?: string;

	/** Replaces the whole list. */
	@IsOptional()
	@IsArray()
	@ArrayMaxSize(6)
	@ValidateNested({ each: true })
	@Type(() => NoticeTranslationInput)
	@Field(() => [NoticeTranslationInput], { nullable: true })
	noticeTranslations?: NoticeTranslationInput[];

	@IsOptional()
	@IsIn([NoticeStatus.HOLD, NoticeStatus.ACTIVE])
	@Field(() => NoticeStatus, { nullable: true })
	noticeStatus?: NoticeStatus;
}

/** The public CS page: notices pinned first then newest, or the FAQ of one tab. */
@InputType()
export class NoticesInquiry {
	@IsInt()
	@Min(1)
	@Field(() => Int)
	page!: number;

	@IsInt()
	@Min(1)
	@Max(50)
	@Field(() => Int)
	limit!: number;

	@IsEnum(NoticeCategory)
	@Field(() => NoticeCategory)
	noticeCategory!: NoticeCategory;

	@IsOptional()
	@IsEnum(InquiryCategory)
	@Field(() => InquiryCategory, { nullable: true })
	noticeFaqCategory?: InquiryCategory;

	/** A guest's language; a signed-in reader's memberLang wins. */
	@IsOptional()
	@IsEnum(Language)
	@Field(() => Language, { nullable: true })
	lang?: Language;
}

@InputType()
export class AdminNoticesInquiry {
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
	@IsEnum(NoticeCategory)
	@Field(() => NoticeCategory, { nullable: true })
	noticeCategory?: NoticeCategory;

	@IsOptional()
	@IsEnum(NoticeStatus)
	@Field(() => NoticeStatus, { nullable: true })
	noticeStatus?: NoticeStatus;
}

@ObjectType()
export class NoticeTranslation {
	@Field(() => Language)
	lang!: Language;

	@Field(() => String)
	title!: string;

	@Field(() => String)
	content!: string;
}

@ObjectType()
export class Notice {
	@Field(() => String)
	_id!: ObjectId;

	@Field(() => NoticeCategory)
	noticeCategory!: NoticeCategory;

	@Field(() => NoticeStatus)
	noticeStatus!: NoticeStatus;

	@Field(() => InquiryCategory, { nullable: true })
	noticeFaqCategory?: InquiryCategory;

	@Field(() => Boolean)
	noticePinned!: boolean;

	@Field(() => String)
	noticeTitle!: string;

	@Field(() => String)
	noticeContent!: string;

	@Field(() => [NoticeTranslation])
	noticeTranslations!: NoticeTranslation[];

	@Field(() => Int)
	noticeViews!: number;

	@Field(() => Date, { nullable: true })
	publishedAt?: Date;

	@Field(() => Date)
	createdAt!: Date;

	/** In the reader's language, or English. */
	@Field(() => String, { nullable: true })
	displayTitle?: string;

	@Field(() => String, { nullable: true })
	displayContent?: string;

	@Field(() => Language, { nullable: true })
	displayLang?: Language;
}

@ObjectType()
export class Notices {
	@Field(() => [Notice])
	list!: Notice[];

	@Field(() => [TotalCounter], { nullable: true })
	metaCounter!: TotalCounter[];
}
