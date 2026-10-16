import { Field, InputType, Int } from '@nestjs/graphql';
import {
	ArrayMaxSize,
	ArrayUnique,
	IsArray,
	IsBoolean,
	IsEnum,
	IsIn,
	IsInt,
	IsMongoId,
	IsOptional,
	Length,
	Matches,
	Max,
	Min,
	ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { BoardArticleCategory, BoardArticleStatus } from '../../enums/board-article.enum';
import { Direction, Language } from '../../enums/common.enum';
import { ARTICLE_IMAGE_PATTERN, ARTICLE_IMAGES_MAX, availableArticleSorts } from '../../config';

/** "Write an article" / "Ask a question". Who may use which board is checked by the service. */
@InputType()
export class ArticleInput {
	@IsEnum(BoardArticleCategory)
	@Field(() => BoardArticleCategory)
	articleCategory!: BoardArticleCategory;

	@Length(2, 150)
	@Field(() => String)
	articleTitle!: string;

	@Length(10, 5000)
	@Field(() => String)
	articleContent!: string;

	@IsEnum(Language)
	@Field(() => Language)
	articleLang!: Language;

	/** Health tips only (checked by the service): up to two of our own uploads, cover first. */
	@IsOptional()
	@IsArray()
	@ArrayMaxSize(ARTICLE_IMAGES_MAX)
	@ArrayUnique()
	@Matches(ARTICLE_IMAGE_PATTERN, {
		each: true,
		message: 'articleImages must be paths returned by /upload/image?target=article',
	})
	@Field(() => [String], { nullable: true })
	articleImages?: string[];
}

/** The author edits the words and a tip's photos, never the board, the status or the counters. */
@InputType()
export class ArticleUpdate {
	@IsMongoId()
	@Field(() => String)
	articleId!: string;

	@IsOptional()
	@Length(2, 150)
	@Field(() => String, { nullable: true })
	articleTitle?: string;

	@IsOptional()
	@Length(10, 5000)
	@Field(() => String, { nullable: true })
	articleContent?: string;

	@IsOptional()
	@IsEnum(Language)
	@Field(() => Language, { nullable: true })
	articleLang?: Language;

	/** The whole new set ([] removes every photo). */
	@IsOptional()
	@IsArray()
	@ArrayMaxSize(ARTICLE_IMAGES_MAX)
	@ArrayUnique()
	@Matches(ARTICLE_IMAGE_PATTERN, {
		each: true,
		message: 'articleImages must be paths returned by /upload/image?target=article',
	})
	@Field(() => [String], { nullable: true })
	articleImages?: string[];
}

@InputType()
class ArticleSearchInput {
	@IsOptional()
	@IsEnum(BoardArticleCategory)
	@Field(() => BoardArticleCategory, { nullable: true })
	articleCategory?: BoardArticleCategory;

	/** Words of the title. Escaped before it becomes a RegExp. */
	@IsOptional()
	@Length(1, 100)
	@Field(() => String, { nullable: true })
	text?: string;

	/** An author's posts — "My Articles" or a doctor's page. */
	@IsOptional()
	@IsMongoId()
	@Field(() => String, { nullable: true })
	memberId?: string;

	/** Q and A: false is the doctors' "Waiting" tab, true "Doctor answered". */
	@IsOptional()
	@IsBoolean()
	@Field(() => Boolean, { nullable: true })
	answered?: boolean;
}

/** The inquiry shape: page, limit, a whitelisted sort, direction, and a search object. */
@InputType()
export class ArticlesInquiry {
	@IsInt()
	@Min(1)
	@Field(() => Int)
	page!: number;

	@IsInt()
	@Min(1)
	@Max(50)
	@Field(() => Int)
	limit!: number;

	@IsOptional()
	@IsIn(availableArticleSorts)
	@Field(() => String, { nullable: true })
	sort?: string;

	@IsOptional()
	@IsEnum(Direction)
	@Field(() => Direction, { nullable: true })
	direction?: Direction;

	@IsOptional()
	@ValidateNested()
	@Type(() => ArticleSearchInput)
	@Field(() => ArticleSearchInput, { nullable: true })
	search?: ArticleSearchInput;
}

@InputType()
export class AdminArticlesInquiry {
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
	@IsEnum(BoardArticleStatus)
	@Field(() => BoardArticleStatus, { nullable: true })
	articleStatus?: BoardArticleStatus;

	@IsOptional()
	@IsEnum(BoardArticleCategory)
	@Field(() => BoardArticleCategory, { nullable: true })
	articleCategory?: BoardArticleCategory;

	/** The "Reported" tab: posts with at least one report, most reported first. */
	@IsOptional()
	@IsBoolean()
	@Field(() => Boolean, { nullable: true })
	reported?: boolean;
}
