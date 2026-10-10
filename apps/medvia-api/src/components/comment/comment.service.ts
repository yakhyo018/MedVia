import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { ClientSession, Connection, Model, ObjectId, Types } from 'mongoose';
import {
	Comment,
	CommentInput,
	Comments,
	CommentsInquiry,
	CommentUpdate,
} from '../../libs/dto/comment/comment';
import { BoardArticleCategory } from '../../libs/enums/board-article.enum';
import { CommentStatus } from '../../libs/enums/comment.enum';
import { Messages } from '../../libs/enums/common.enum';
import { MemberType } from '../../libs/enums/member.enum';
import { AuthMember, T } from '../../libs/types/common';
import { shapeIntoMongoObjectId } from '../../libs/config';
import { BoardArticleService, lookupAuthor } from '../board-article/board-article.service';
import { authorName } from '../board-article/community.rules';

/**
 * Flat comments on community posts. The post must be ACTIVE, and the comment, the post's
 * counter and "Doctor answered" change together in one transaction — never two unrelated
 * writes that can half-happen.
 */
@Injectable()
export class CommentService {
	constructor(
		@InjectModel('Comment') private readonly commentModel: Model<T>,
		@InjectConnection() private readonly connection: Connection,
		private readonly articleService: BoardArticleService,
	) {}

	/** A doctor's comment on a question is its answer: the post gets "Doctor answered". */
	public async createComment(authMember: AuthMember, input: CommentInput): Promise<Comment> {
		const article = await this.articleService.findActive(this.toObjectId(input.articleId));
		if (!article) throw new NotFoundException(Messages.NO_DATA_FOUND);

		let created!: T;
		await this.inTransaction(async (session) => {
			const [doc] = await this.commentModel.create(
				[
					{
						commentContent: input.commentContent,
						commentLang: input.commentLang,
						commentAuthorType: authMember.memberType,
						articleId: article._id,
						memberId: authMember._id,
					},
				],
				{ session },
			);
			created = doc.toObject();
			await this.articleService.statsEditor(article._id, 'articleComments', 1, session);
			await this.recomputeAnswered(article, session);
		});
		return (await this.findWithAuthor({ _id: created._id }))!;
	}

	public async updateComment(authMember: AuthMember, input: CommentUpdate): Promise<Comment> {
		const set: T = { commentContent: input.commentContent };
		if (input.commentLang) set.commentLang = input.commentLang;
		const updated = await this.commentModel
			.findOneAndUpdate(
				{
					_id: this.toObjectId(input.commentId),
					memberId: authMember._id,
					commentStatus: CommentStatus.ACTIVE,
				},
				{ $set: set },
				{ new: true },
			)
			.lean()
			.exec();
		if (!updated) throw new NotFoundException(Messages.NO_DATA_FOUND);
		return (await this.findWithAuthor({ _id: updated._id }))!;
	}

	/** Soft delete by the author; a visible comment leaves the post's count and maybe its answer. */
	public async removeComment(authMember: AuthMember, commentId: string): Promise<Comment> {
		let removed: T | null = null;
		await this.inTransaction(async (session) => {
			const before = await this.commentModel
				.findOneAndUpdate(
					{
						_id: this.toObjectId(commentId),
						memberId: authMember._id,
						commentStatus: { $ne: CommentStatus.DELETE },
					},
					{ $set: { commentStatus: CommentStatus.DELETE, deletedAt: new Date() } },
					{ session },
				)
				.lean()
				.exec();
			if (!before) throw new NotFoundException(Messages.NO_DATA_FOUND);
			removed = { ...before, commentStatus: CommentStatus.DELETE };
			if (before.commentStatus === CommentStatus.ACTIVE) await this.leaveCount(before, session);
		});
		return removed as unknown as Comment;
	}

	/** Under a post, oldest first. Only ACTIVE comments of an ACTIVE post are public. */
	public async getComments(input: CommentsInquiry): Promise<Comments> {
		const article = await this.articleService.findActive(this.toObjectId(input.articleId));
		if (!article) throw new NotFoundException(Messages.NO_DATA_FOUND);

		const [result] = await this.commentModel
			.aggregate([
				{ $match: { articleId: article._id, commentStatus: CommentStatus.ACTIVE } },
				{ $sort: { createdAt: 1, _id: 1 } },
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
		return { list: result.list.map((c: T) => this.present(c)), metaCounter: result.metaCounter };
	}

	/* ───────────────────────── called by report ───────────────────────── */

	public async findNotDeleted(_id: unknown): Promise<T | null> {
		return await this.commentModel
			.findOne({ _id, commentStatus: { $ne: CommentStatus.DELETE } })
			.lean()
			.exec();
	}

	public async addReport(_id: unknown, session?: ClientSession): Promise<T | null> {
		return await this.commentModel
			.findByIdAndUpdate(_id, { $inc: { commentReports: 1 } }, { new: true, session })
			.lean()
			.exec();
	}

	public async resetReports(_id: unknown, session?: ClientSession): Promise<void> {
		await this.commentModel.updateOne({ _id }, { $set: { commentReports: 0 } }, { session }).exec();
	}

	/**
	 * Hide or show, conditional on the current status, with the post's count and its answer
	 * following. Returns null when the comment was not in `from` (already decided).
	 */
	public async moveStatus(
		_id: unknown,
		from: CommentStatus,
		to: CommentStatus,
		session: ClientSession,
	): Promise<T | null> {
		const before = await this.commentModel
			.findOneAndUpdate({ _id, commentStatus: from }, { $set: { commentStatus: to } }, { session })
			.lean()
			.exec();
		if (!before) return null;
		if (from === CommentStatus.ACTIVE) await this.leaveCount(before, session);
		if (to === CommentStatus.ACTIVE) await this.joinCount(before, session);
		return { ...before, commentStatus: to };
	}

	/* ───────────────────────── helpers ───────────────────────── */

	private async leaveCount(comment: T, session: ClientSession): Promise<void> {
		await this.articleService.statsEditor(comment.articleId, 'articleComments', -1, session);
		await this.recomputeAnswered({ _id: comment.articleId }, session);
	}

	private async joinCount(comment: T, session: ClientSession): Promise<void> {
		await this.articleService.statsEditor(comment.articleId, 'articleComments', 1, session);
		await this.recomputeAnswered({ _id: comment.articleId }, session);
	}

	/**
	 * "Doctor answered" is derived: is there an ACTIVE comment of a doctor under this question?
	 * Recomputed instead of flipped, so a doctor's answer that is deleted or hidden takes the
	 * badge with it, and a second doctor's answer keeps it (the M4 / M6 pattern).
	 */
	private async recomputeAnswered(article: T, session: ClientSession): Promise<void> {
		const post = article.articleCategory
			? article
			: await this.articleService.findNotDeleted(article._id);
		if (!post || post.articleCategory !== BoardArticleCategory.QNA) return;
		const answered = await this.commentModel
			.exists({
				articleId: post._id,
				commentStatus: CommentStatus.ACTIVE,
				commentAuthorType: MemberType.DOCTOR,
			})
			.session(session)
			.exec();
		await this.articleService.setAnswered(post._id, !!answered, session);
	}

	private async findWithAuthor(match: T): Promise<Comment | null> {
		const [comment] = await this.commentModel
			.aggregate([{ $match: match }, ...lookupAuthor])
			.exec();
		return comment ? this.present(comment) : null;
	}

	private present(comment: T): Comment {
		const { authorFullName, ...rest } = comment;
		return {
			...rest,
			authorName: authorName(authorFullName ?? '', comment.commentAuthorType ?? MemberType.USER),
			authorType: comment.commentAuthorType,
		} as Comment;
	}

	private async inTransaction(work: (session: ClientSession) => Promise<void>): Promise<void> {
		const session = await this.connection.startSession();
		try {
			await session.withTransaction(() => work(session));
		} finally {
			await session.endSession();
		}
	}

	private toObjectId(id: string): ObjectId {
		if (!Types.ObjectId.isValid(id)) throw new NotFoundException(Messages.NO_DATA_FOUND);
		return shapeIntoMongoObjectId(id) as ObjectId;
	}
}
