import { Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, ObjectId, PipelineStage, Types } from 'mongoose';
import { BoardArticle, BoardArticles } from '../../libs/dto/board-article/board-article';
import {
	AdminArticlesInquiry,
	ArticleInput,
	ArticlesInquiry,
	ArticleUpdate,
} from '../../libs/dto/board-article/board-article.input';
import { BoardArticleStatus } from '../../libs/enums/board-article.enum';
import { Messages } from '../../libs/enums/common.enum';
import { LikeGroup } from '../../libs/enums/like.enum';
import { MemberType } from '../../libs/enums/member.enum';
import { ViewGroup } from '../../libs/enums/view.enum';
import { AuthMember, T } from '../../libs/types/common';
import { shapeIntoMongoObjectId } from '../../libs/config';
import { LikeService } from '../like/like.service';
import { ViewService } from '../view/view.service';
import { articleMatch, articleSort, authorName, checkCanPost } from './community.rules';

/** The author's name and type, for "Feride K." and the doctor badge. */
export const lookupAuthor: PipelineStage.FacetPipelineStage[] = [
	{
		$lookup: {
			from: 'members',
			localField: 'memberId',
			foreignField: '_id',
			pipeline: [{ $project: { memberFullName: 1, memberType: 1 } }],
			as: 'author',
		},
	},
	{
		$addFields: {
			authorFullName: { $first: '$author.memberFullName' },
			authorType: { $first: '$author.memberType' },
		},
	},
	{ $project: { author: 0 } },
];

/**
 * Community posts. The search text is escaped (ReDoS), nothing is hard-deleted, the author
 * edits only the words (not the status or counters), and a missing post is a 404, not a 500.
 */
@Injectable()
export class BoardArticleService implements OnModuleInit {
	constructor(
		@InjectModel('BoardArticle') private readonly articleModel: Model<T>,
		private readonly likeService: LikeService,
		private readonly viewService: ViewService,
	) {}

	/** The post's answer to likeTarget(ARTICLE): ACTIVE posts only, counter in articleLikes. */
	public onModuleInit(): void {
		this.likeService.registerTarget(LikeGroup.ARTICLE, {
			isLikeable: async (_id) => !!(await this.findActive(_id)),
			moveLikes: async (_id, modifier) =>
				(await this.statsEditor(_id, 'articleLikes', modifier))?.articleLikes ?? 0,
			countLikes: async (_id) =>
				(await this.articleModel.findById(_id, { articleLikes: 1 }).lean().exec())?.articleLikes ??
				0,
		});
	}

	/* ───────────────────────── authors ───────────────────────── */

	public async createArticle(authMember: AuthMember, input: ArticleInput): Promise<BoardArticle> {
		checkCanPost(authMember.memberType, input.articleCategory);
		const created = await this.articleModel.create({ ...input, memberId: authMember._id });
		return (await this.findWithAuthor({ _id: created._id }))!;
	}

	/** Only the words; a hidden post stays hidden — the author cannot edit their way out. */
	public async updateArticle(authMember: AuthMember, input: ArticleUpdate): Promise<BoardArticle> {
		const { articleId, ...fields } = input;
		const set = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined));
		const updated = await this.articleModel
			.findOneAndUpdate(
				{
					_id: this.toObjectId(articleId),
					memberId: authMember._id,
					articleStatus: BoardArticleStatus.ACTIVE,
				},
				{ $set: set },
				{ new: true, runValidators: true },
			)
			.lean()
			.exec();
		if (!updated) throw new NotFoundException(Messages.NO_DATA_FOUND);
		return (await this.findWithAuthor({ _id: updated._id }))!;
	}

	/** Soft delete by the author: the post leaves every list; likes and views stay as history. */
	public async removeArticle(authMember: AuthMember, articleId: string): Promise<BoardArticle> {
		const removed = await this.articleModel
			.findOneAndUpdate(
				{
					_id: this.toObjectId(articleId),
					memberId: authMember._id,
					articleStatus: { $ne: BoardArticleStatus.DELETE },
				},
				{ $set: { articleStatus: BoardArticleStatus.DELETE, deletedAt: new Date() } },
				{ new: true },
			)
			.lean()
			.exec();
		if (!removed) throw new NotFoundException(Messages.NO_DATA_FOUND);
		return removed as unknown as BoardArticle;
	}

	/* ───────────────────────── public ───────────────────────── */

	/**
	 * One post. A signed-in viewer's first visit counts once (the views collection is unique
	 * per member and post); a guest reads without counting.
	 */
	public async getArticle(authMember: AuthMember | null, articleId: string): Promise<BoardArticle> {
		const _id = this.toObjectId(articleId);
		const article = await this.findWithAuthor({ _id, articleStatus: BoardArticleStatus.ACTIVE });
		if (!article) throw new NotFoundException(Messages.NO_DATA_FOUND);

		if (authMember) {
			const first = await this.viewService.recordView({
				memberId: authMember._id,
				viewRefId: _id,
				viewGroup: ViewGroup.ARTICLE,
			});
			if (first)
				article.articleViews = (await this.statsEditor(_id, 'articleViews', 1))?.articleViews ?? 0;
			article.meLiked = await this.likeService.isLiked(authMember._id, _id);
		}
		delete article.articleReports;
		return article;
	}

	/** The inquiry shape: $match from search, a whitelisted $sort, $facet for page + total. */
	public async getArticles(
		authMember: AuthMember | null,
		input: ArticlesInquiry,
	): Promise<BoardArticles> {
		const search = {
			...input.search,
			memberId: input.search?.memberId && this.toObjectId(input.search.memberId),
		};
		const [result] = await this.articleModel
			.aggregate([
				{ $match: articleMatch(search) },
				{ $sort: articleSort(input.sort, input.direction) },
				{
					$facet: {
						list: [
							{ $skip: (input.page - 1) * input.limit },
							{ $limit: input.limit },
							{ $project: { articleReports: 0 } },
							...lookupAuthor,
						],
						metaCounter: [{ $count: 'total' }],
					},
				},
			])
			.exec();

		const liked = authMember
			? await this.likeService.likedIds(
					authMember._id,
					result.list.map((a: T) => a._id),
				)
			: null;
		return {
			list: result.list.map((a: T) => ({
				...this.present(a),
				meLiked: liked ? liked.has(String(a._id)) : null,
			})),
			metaCounter: result.metaCounter,
		};
	}

	/* ───────────────────────── admin ───────────────────────── */

	public async getArticlesByAdmin(input: AdminArticlesInquiry): Promise<BoardArticles> {
		const match: T = {};
		if (input.articleStatus) match.articleStatus = input.articleStatus;
		else match.articleStatus = { $ne: BoardArticleStatus.DELETE };
		if (input.articleCategory) match.articleCategory = input.articleCategory;
		if (input.reported) match.articleReports = { $gt: 0 };
		const sort: T = input.reported
			? { articleReports: -1, createdAt: -1 }
			: { createdAt: -1, _id: -1 };

		const [result] = await this.articleModel
			.aggregate([
				{ $match: match },
				{ $sort: sort },
				{
					$facet: {
						list: [
							{ $skip: (input.page - 1) * input.limit },
							{ $limit: input.limit },
							...lookupAuthor,
						],
						metaCounter: [{ $count: 'total' }],
					},
				},
			])
			.exec();
		return { list: result.list.map((a: T) => this.present(a)), metaCounter: result.metaCounter };
	}

	/* ───────────────────────── called by comment and report ───────────────────────── */

	public async findActive(_id: unknown): Promise<T | null> {
		return await this.articleModel
			.findOne({ _id, articleStatus: BoardArticleStatus.ACTIVE })
			.lean()
			.exec();
	}

	/** Any post that is not deleted — for reports and the admin, who also see hidden ones. */
	public async findNotDeleted(_id: unknown): Promise<T | null> {
		return await this.articleModel
			.findOne({ _id, articleStatus: { $ne: BoardArticleStatus.DELETE } })
			.lean()
			.exec();
	}

	public async statsEditor(
		_id: unknown,
		targetKey: 'articleLikes' | 'articleViews' | 'articleComments' | 'articleReports',
		modifier: number,
		session?: ClientSession,
	): Promise<T | null> {
		return await this.articleModel
			.findByIdAndUpdate(_id, { $inc: { [targetKey]: modifier } }, { new: true, session })
			.lean()
			.exec();
	}

	/**
	 * A conditional status change: `from` must still hold, so an admin's decision and the
	 * automatic hide at 5 reports cannot overwrite each other. Returns null if it did not apply.
	 */
	public async moveStatus(
		_id: unknown,
		from: BoardArticleStatus,
		to: BoardArticleStatus,
		session?: ClientSession,
	): Promise<T | null> {
		return await this.articleModel
			.findOneAndUpdate(
				{ _id, articleStatus: from },
				{ $set: { articleStatus: to } },
				{ new: true, session },
			)
			.lean()
			.exec();
	}

	/** After an admin's decision every pending report is closed, so the count starts again. */
	public async resetReports(_id: unknown, session?: ClientSession): Promise<void> {
		await this.articleModel.updateOne({ _id }, { $set: { articleReports: 0 } }, { session }).exec();
	}

	/** "Doctor answered", recomputed from the ACTIVE doctor comments — never flipped blindly. */
	public async setAnswered(
		_id: unknown,
		answered: boolean,
		session?: ClientSession,
	): Promise<void> {
		await this.articleModel
			.updateOne({ _id }, { $set: { articleAnswered: answered } }, { session })
			.exec();
	}

	/* ───────────────────────── helpers ───────────────────────── */

	private async findWithAuthor(match: T): Promise<BoardArticle | null> {
		const [article] = await this.articleModel
			.aggregate([{ $match: match }, ...lookupAuthor])
			.exec();
		return article ? this.present(article) : null;
	}

	private present(article: T): BoardArticle {
		const { authorFullName, ...rest } = article;
		return {
			...rest,
			authorName: authorName(authorFullName ?? '', article.authorType ?? MemberType.USER),
		} as unknown as BoardArticle;
	}

	private toObjectId(id: string): ObjectId {
		if (!Types.ObjectId.isValid(id)) throw new NotFoundException(Messages.NO_DATA_FOUND);
		return shapeIntoMongoObjectId(id) as ObjectId;
	}
}
