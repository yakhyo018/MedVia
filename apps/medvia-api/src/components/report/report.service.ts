import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { ClientSession, Connection, Model, ObjectId, Types } from 'mongoose';
import {
	ModerationInput,
	ModerationResult,
	Report,
	ReportInput,
	Reports,
	ReportsInquiry,
} from '../../libs/dto/report/report';
import { AuditAction, AuditGroup } from '../../libs/enums/admin.enum';
import { BoardArticleStatus } from '../../libs/enums/board-article.enum';
import { CommentStatus } from '../../libs/enums/comment.enum';
import { Messages } from '../../libs/enums/common.enum';
import { ModerationDecision, ReportGroup, ReportStatus } from '../../libs/enums/report.enum';
import { AuthMember, T } from '../../libs/types/common';
import { shapeIntoMongoObjectId } from '../../libs/config';
import { AuditLogService } from '../audit-log/audit-log.service';
import { BoardArticleService } from '../board-article/board-article.service';
import {
	checkCanReport,
	REPORT_HIDE_THRESHOLD,
	reportOutcome,
} from '../board-article/community.rules';
import { CommentService } from '../comment/comment.service';

const DUPLICATE_KEY = 11000;

const AUDIT: Record<ReportGroup, Record<ModerationDecision, AuditAction>> = {
	[ReportGroup.ARTICLE]: { HIDE: AuditAction.ARTICLE_HIDE, SHOW: AuditAction.ARTICLE_SHOW },
	[ReportGroup.COMMENT]: { HIDE: AuditAction.COMMENT_HIDE, SHOW: AuditAction.COMMENT_SHOW },
};

/**
 * Reports and the admin's decision on them. A report counts distinct people (unique index);
 * five pending reports hide the post or comment at once, so abuse does not wait for an admin
 * to wake up. The admin then confirms (HIDE) or restores (SHOW), which closes every pending
 * report of it and starts the count again.
 */
@Injectable()
export class ReportService {
	constructor(
		@InjectModel('Report') private readonly reportModel: Model<T>,
		@InjectConnection() private readonly connection: Connection,
		private readonly articleService: BoardArticleService,
		private readonly commentService: CommentService,
		private readonly auditLogService: AuditLogService,
	) {}

	public async reportContent(authMember: AuthMember, input: ReportInput): Promise<Report> {
		const refId = this.toObjectId(input.reportRefId);
		const target = await this.findTarget(input.reportGroup, refId);
		if (!target || this.statusOf(input.reportGroup, target) !== 'ACTIVE') {
			throw new NotFoundException(Messages.NO_DATA_FOUND);
		}
		checkCanReport(authMember._id, target.memberId);

		let created!: T;
		try {
			await this.inTransaction(async (session) => {
				const [doc] = await this.reportModel.create(
					[
						{
							reportGroup: input.reportGroup,
							reportReason: input.reportReason,
							reportDetail: input.reportDetail,
							reportRefId: refId,
							memberId: authMember._id,
						},
					],
					{ session },
				);
				created = doc.toObject();
				await this.addReportAndMaybeHide(input.reportGroup, refId, session);
			});
		} catch (err: any) {
			// The unique {memberId, reportRefId} index: the same person reporting twice.
			if (err?.code === DUPLICATE_KEY) throw new BadRequestException(Messages.ALREADY_REPORTED);
			throw err;
		}
		return created as Report;
	}

	/** The queue: oldest first, with the reported text so the admin can judge without clicking. */
	public async getReportsByAdmin(input: ReportsInquiry): Promise<Reports> {
		const [result] = await this.reportModel
			.aggregate([
				{ $match: { reportStatus: input.reportStatus ?? ReportStatus.PENDING } },
				{ $sort: { createdAt: 1, _id: 1 } },
				{
					$facet: {
						list: [
							{ $skip: (input.page - 1) * input.limit },
							{ $limit: input.limit },
							{
								$lookup: {
									from: 'boardArticles',
									localField: 'reportRefId',
									foreignField: '_id',
									pipeline: [{ $project: { articleTitle: 1, articleStatus: 1 } }],
									as: 'a',
								},
							},
							{
								$lookup: {
									from: 'comments',
									localField: 'reportRefId',
									foreignField: '_id',
									pipeline: [{ $project: { commentContent: 1, commentStatus: 1 } }],
									as: 'c',
								},
							},
							{
								$addFields: {
									targetText: {
										$ifNull: [{ $first: '$a.articleTitle' }, { $first: '$c.commentContent' }],
									},
									targetStatus: {
										$ifNull: [{ $first: '$a.articleStatus' }, { $first: '$c.commentStatus' }],
									},
								},
							},
							{ $project: { a: 0, c: 0 } },
						],
						metaCounter: [{ $count: 'total' }],
					},
				},
			])
			.exec();
		return result as Reports;
	}

	/**
	 * HIDE or SHOW a post or comment and close its pending reports with the outcome — one
	 * transaction. The status change is conditional and skipped when it already holds: hiding a
	 * post that the 5 reports already hid just confirms them.
	 */
	public async moderateContent(
		adminId: ObjectId,
		input: ModerationInput,
	): Promise<ModerationResult> {
		const refId = this.toObjectId(input.refId);
		const target = await this.findTarget(input.reportGroup, refId);
		if (!target) throw new NotFoundException(Messages.NO_DATA_FOUND);

		const hide = input.decision === ModerationDecision.HIDE;
		let status = this.statusOf(input.reportGroup, target);
		let reportsClosed = 0;

		await this.inTransaction(async (session) => {
			const moved =
				input.reportGroup === ReportGroup.ARTICLE
					? await this.articleService.moveStatus(
							refId,
							hide ? BoardArticleStatus.ACTIVE : BoardArticleStatus.HIDDEN,
							hide ? BoardArticleStatus.HIDDEN : BoardArticleStatus.ACTIVE,
							session,
						)
					: await this.commentService.moveStatus(
							refId,
							hide ? CommentStatus.ACTIVE : CommentStatus.HIDDEN,
							hide ? CommentStatus.HIDDEN : CommentStatus.ACTIVE,
							session,
						);
			if (moved) status = hide ? 'HIDDEN' : 'ACTIVE';

			const closed = await this.reportModel
				.updateMany(
					{ reportRefId: refId, reportStatus: ReportStatus.PENDING },
					{ $set: { reportStatus: reportOutcome(input.decision) } },
					{ session },
				)
				.exec();
			reportsClosed = closed.modifiedCount;
			if (input.reportGroup === ReportGroup.ARTICLE)
				await this.articleService.resetReports(refId, session);
			else await this.commentService.resetReports(refId, session);
		});

		await this.auditLogService.record({
			auditAction: AUDIT[input.reportGroup][input.decision],
			auditGroup:
				input.reportGroup === ReportGroup.ARTICLE ? AuditGroup.ARTICLE : AuditGroup.COMMENT,
			auditRefId: refId,
			auditNote: input.note,
			memberId: adminId,
		});
		return { refId, status, reportsClosed };
	}

	/* ───────────────────────── helpers ───────────────────────── */

	/** +1 pending report; at the threshold the target hides itself (only from ACTIVE, only once). */
	private async addReportAndMaybeHide(
		group: ReportGroup,
		refId: unknown,
		session: ClientSession,
	): Promise<void> {
		if (group === ReportGroup.ARTICLE) {
			const after = await this.articleService.statsEditor(refId, 'articleReports', 1, session);
			if ((after?.articleReports ?? 0) >= REPORT_HIDE_THRESHOLD) {
				await this.articleService.moveStatus(
					refId,
					BoardArticleStatus.ACTIVE,
					BoardArticleStatus.HIDDEN,
					session,
				);
			}
			return;
		}
		const after = await this.commentService.addReport(refId, session);
		if ((after?.commentReports ?? 0) >= REPORT_HIDE_THRESHOLD) {
			await this.commentService.moveStatus(
				refId,
				CommentStatus.ACTIVE,
				CommentStatus.HIDDEN,
				session,
			);
		}
	}

	private async findTarget(group: ReportGroup, refId: unknown): Promise<T | null> {
		return group === ReportGroup.ARTICLE
			? await this.articleService.findNotDeleted(refId)
			: await this.commentService.findNotDeleted(refId);
	}

	private statusOf(group: ReportGroup, target: T): string {
		return group === ReportGroup.ARTICLE ? target.articleStatus : target.commentStatus;
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
