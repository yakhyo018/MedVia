import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, ObjectId, Types } from 'mongoose';
import {
	AdminNoticesInquiry,
	Notice,
	NoticeInput,
	Notices,
	NoticesInquiry,
	NoticeUpdate,
} from '../../libs/dto/notice/notice';
import { Language, Messages } from '../../libs/enums/common.enum';
import { NoticeStatus } from '../../libs/enums/notice.enum';
import { AuthMember, T } from '../../libs/types/common';
import { shapeIntoMongoObjectId } from '../../libs/config';
import { checkNoticeShape, localizeNotice, publishedAtFor } from './cs.rules';

/**
 * Notices and FAQ answers. The team writes them (HOLD until published); everyone reads the
 * ACTIVE ones in their language — a signed-in reader's memberLang, a guest's `lang`, else English.
 */
@Injectable()
export class NoticeService {
	constructor(
		@InjectModel('Notice') private readonly noticeModel: Model<T>,
		@InjectModel('Member') private readonly memberModel: Model<T>,
	) {}

	/* ───────────────────────── admin ───────────────────────── */

	public async createNotice(adminId: ObjectId, input: NoticeInput): Promise<Notice> {
		checkNoticeShape(input.noticeCategory, input.noticeFaqCategory);
		const created = await this.noticeModel.create({
			...input,
			publishedAt: publishedAtFor(null, input.noticeStatus, new Date()),
			memberId: adminId,
		});
		return localizeNotice(created.toObject()) as Notice;
	}

	/** Category and FAQ tab are fixed at creation; the words, pin, translations and status move. */
	public async updateNotice(input: NoticeUpdate): Promise<Notice> {
		const { noticeId, ...fields } = input;
		const current = await this.findNotDeleted(noticeId);
		const set: T = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined));
		const publishedAt = publishedAtFor(current, input.noticeStatus, new Date());
		if (publishedAt) set.publishedAt = publishedAt;

		const updated = await this.noticeModel
			.findOneAndUpdate(
				{ _id: current._id, noticeStatus: { $ne: NoticeStatus.DELETE } },
				{ $set: set },
				{ new: true },
			)
			.lean()
			.exec();
		if (!updated) throw new NotFoundException(Messages.NO_DATA_FOUND);
		return localizeNotice(updated) as Notice;
	}

	public async removeNotice(noticeId: string): Promise<Notice> {
		const current = await this.findNotDeleted(noticeId);
		const removed = await this.noticeModel
			.findByIdAndUpdate(
				current._id,
				{ $set: { noticeStatus: NoticeStatus.DELETE, deletedAt: new Date() } },
				{ new: true },
			)
			.lean()
			.exec();
		return removed as unknown as Notice;
	}

	public async getNoticesByAdmin(input: AdminNoticesInquiry): Promise<Notices> {
		const match: T = { noticeStatus: input.noticeStatus ?? { $ne: NoticeStatus.DELETE } };
		if (input.noticeCategory) match.noticeCategory = input.noticeCategory;
		return await this.page(match, { createdAt: -1, _id: -1 }, input.page, input.limit, undefined);
	}

	/* ───────────────────────── public ───────────────────────── */

	/** Pinned first, then the newest publication. */
	public async getNotices(authMember: AuthMember | null, input: NoticesInquiry): Promise<Notices> {
		const match: T = { noticeStatus: NoticeStatus.ACTIVE, noticeCategory: input.noticeCategory };
		if (input.noticeFaqCategory) match.noticeFaqCategory = input.noticeFaqCategory;
		const lang = await this.readerLang(authMember, input.lang);
		return await this.page(
			match,
			{ noticePinned: -1, publishedAt: -1, _id: -1 },
			input.page,
			input.limit,
			lang,
		);
	}

	/** One notice; every read counts — notices are public and anonymous, so there is no "first visit". */
	public async getNotice(
		authMember: AuthMember | null,
		noticeId: string,
		lang?: Language,
	): Promise<Notice> {
		const notice = await this.noticeModel
			.findOneAndUpdate(
				{ _id: this.toObjectId(noticeId), noticeStatus: NoticeStatus.ACTIVE },
				{ $inc: { noticeViews: 1 } },
				{ new: true },
			)
			.lean()
			.exec();
		if (!notice) throw new NotFoundException(Messages.NO_DATA_FOUND);
		return localizeNotice(notice, await this.readerLang(authMember, lang)) as Notice;
	}

	/* ───────────────────────── helpers ───────────────────────── */

	private async page(
		match: T,
		sort: T,
		page: number,
		limit: number,
		lang?: Language,
	): Promise<Notices> {
		const [result] = await this.noticeModel
			.aggregate([
				{ $match: match },
				{ $sort: sort },
				{
					$facet: {
						list: [{ $skip: (page - 1) * limit }, { $limit: limit }],
						metaCounter: [{ $count: 'total' }],
					},
				},
			])
			.exec();
		return {
			list: result.list.map((n: T) => localizeNotice(n, lang)),
			metaCounter: result.metaCounter,
		};
	}

	private async readerLang(
		authMember: AuthMember | null,
		lang?: Language,
	): Promise<Language | undefined> {
		if (!authMember) return lang;
		const member = await this.memberModel.findById(authMember._id, { memberLang: 1 }).lean().exec();
		return (member?.memberLang as Language) ?? lang;
	}

	private async findNotDeleted(noticeId: string): Promise<T> {
		const notice = await this.noticeModel
			.findOne({ _id: this.toObjectId(noticeId), noticeStatus: { $ne: NoticeStatus.DELETE } })
			.lean()
			.exec();
		if (!notice) throw new NotFoundException(Messages.NO_DATA_FOUND);
		return notice;
	}

	private toObjectId(id: string): ObjectId {
		if (!Types.ObjectId.isValid(id)) throw new NotFoundException(Messages.NO_DATA_FOUND);
		return shapeIntoMongoObjectId(id) as ObjectId;
	}
}
