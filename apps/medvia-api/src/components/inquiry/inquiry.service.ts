import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, ObjectId, PipelineStage, Types } from 'mongoose';
import {
	AdminInquiriesInquiry,
	Inquiries,
	Inquiry,
	InquiryInput,
	InquiryMessageInput,
} from '../../libs/dto/inquiry/inquiry';
import { OrdinaryInquiry } from '../../libs/dto/common/inquiry';
import { Messages } from '../../libs/enums/common.enum';
import { InquirySender, InquiryStatus } from '../../libs/enums/inquiry.enum';
import { MemberType } from '../../libs/enums/member.enum';
import { AuthMember, T } from '../../libs/types/common';
import { shapeIntoMongoObjectId } from '../../libs/config';
import { BookingService } from '../booking/booking.service';
import {
	checkCanResolve,
	nextStatusOnMessage,
	OPEN_STATUSES,
	threadHasRoom,
} from '../notice/cs.rules';

/** The patient's name and the booking code, for the team's ticket view. */
const lookupTicket: PipelineStage.FacetPipelineStage[] = [
	{
		$lookup: {
			from: 'members',
			localField: 'memberId',
			foreignField: '_id',
			pipeline: [{ $project: { memberFullName: 1 } }],
			as: 'p',
		},
	},
	{
		$lookup: {
			from: 'bookings',
			localField: 'bookingId',
			foreignField: '_id',
			pipeline: [{ $project: { bookingCode: 1 } }],
			as: 'b',
		},
	},
	{
		$addFields: {
			patientName: { $first: '$p.memberFullName' },
			bookingCode: { $first: '$b.bookingCode' },
		},
	},
	{ $project: { p: 0, b: 0 } },
];

/**
 * 1:1 support tickets. A patient sees only their own; the team sees all. Every status change is
 * a conditional write on the status that was read, so a reply and a "resolved" click at the
 * same moment cannot both apply.
 */
@Injectable()
export class InquiryService {
	constructor(
		@InjectModel('Inquiry') private readonly inquiryModel: Model<T>,
		private readonly bookingService: BookingService,
	) {}

	/* ───────────────────────── patient ───────────────────────── */

	/** A related booking must be the patient's own — another patient's id is "not found". */
	public async createInquiry(memberId: ObjectId, input: InquiryInput): Promise<Inquiry> {
		const booking = input.bookingId
			? await this.bookingService.findOwnBooking(memberId, input.bookingId)
			: null;
		const created = await this.inquiryModel.create({
			...input,
			inquiryReplyLang: input.inquiryReplyLang ?? input.inquiryLang,
			bookingId: booking?._id,
			memberId,
		});
		return created.toObject() as unknown as Inquiry;
	}

	public async getMyInquiries(memberId: ObjectId, input: OrdinaryInquiry): Promise<Inquiries> {
		return await this.page({ memberId }, { createdAt: -1, _id: -1 }, input.page, input.limit);
	}

	/* ───────────────────────── patient and team ───────────────────────── */

	public async getInquiry(authMember: AuthMember, inquiryId: string): Promise<Inquiry> {
		const [inquiry] = await this.inquiryModel
			.aggregate([
				{ $match: { _id: this.toObjectId(inquiryId), ...this.scopeOf(authMember) } },
				...lookupTicket,
			])
			.exec();
		if (!inquiry) throw new NotFoundException(Messages.NO_DATA_FOUND);
		return inquiry as unknown as Inquiry;
	}

	/**
	 * A message from the patient or the team. Two conditions in one atomic update: the status is
	 * still the one read (a concurrent reply or resolve wins cleanly), and the 50th slot of the
	 * thread is still empty — the cap holds even when two messages arrive at once.
	 */
	public async addInquiryMessage(
		authMember: AuthMember,
		input: InquiryMessageInput,
	): Promise<Inquiry> {
		const current = await this.findScoped(authMember, input.inquiryId);
		const sender = this.senderOf(authMember);
		const next = nextStatusOnMessage(current.inquiryStatus, sender);

		const updated = await this.inquiryModel
			.findOneAndUpdate(
				{ _id: current._id, inquiryStatus: current.inquiryStatus, ...threadHasRoom() },
				{
					$set: { inquiryStatus: next },
					$push: {
						inquiryMessages: {
							senderId: authMember._id,
							senderType: sender,
							text: input.text,
							lang: input.lang,
							createdAt: new Date(),
						},
					},
				},
				{ new: true },
			)
			.lean()
			.exec();
		if (!updated) {
			// Which condition failed: no room left, or the status moved under us.
			const hasRoom = await this.inquiryModel
				.exists({ _id: current._id, ...threadHasRoom() })
				.exec();
			throw new BadRequestException(hasRoom ? Messages.WRONG_STATUS : Messages.INQUIRY_THREAD_FULL);
		}
		return updated as unknown as Inquiry;
	}

	/** "Mark as resolved" — by the team or the patient. Final: the thread closes. */
	public async resolveInquiry(authMember: AuthMember, inquiryId: string): Promise<Inquiry> {
		const current = await this.findScoped(authMember, inquiryId);
		checkCanResolve(current.inquiryStatus);
		const updated = await this.inquiryModel
			.findOneAndUpdate(
				{ _id: current._id, inquiryStatus: current.inquiryStatus },
				{ $set: { inquiryStatus: InquiryStatus.RESOLVED, resolvedAt: new Date() } },
				{ new: true },
			)
			.lean()
			.exec();
		if (!updated) throw new BadRequestException(Messages.WRONG_STATUS);
		return updated as unknown as Inquiry;
	}

	/* ───────────────────────── team ───────────────────────── */

	/** "Open" first and oldest first: the queue; otherwise newest first. */
	public async getInquiriesByAdmin(input: AdminInquiriesInquiry): Promise<Inquiries> {
		const match: T = {};
		if (input.open) match.inquiryStatus = { $in: OPEN_STATUSES };
		else if (input.inquiryStatus) match.inquiryStatus = input.inquiryStatus;
		if (input.inquiryCategory) match.inquiryCategory = input.inquiryCategory;
		const sort: T = input.open ? { createdAt: 1, _id: 1 } : { createdAt: -1, _id: -1 };
		return await this.page(match, sort, input.page, input.limit);
	}

	/* ───────────────────────── helpers ───────────────────────── */

	private async page(match: T, sort: T, page: number, limit: number): Promise<Inquiries> {
		const [result] = await this.inquiryModel
			.aggregate([
				{ $match: match },
				{ $sort: sort },
				{
					$facet: {
						list: [{ $skip: (page - 1) * limit }, { $limit: limit }, ...lookupTicket],
						metaCounter: [{ $count: 'total' }],
					},
				},
			])
			.exec();
		return result as Inquiries;
	}

	/** A patient's own tickets; the team's all of them. */
	private scopeOf(authMember: AuthMember): T {
		return authMember.memberType === MemberType.ADMIN ? {} : { memberId: authMember._id };
	}

	private senderOf(authMember: AuthMember): InquirySender {
		return authMember.memberType === MemberType.ADMIN ? InquirySender.ADMIN : InquirySender.PATIENT;
	}

	private async findScoped(authMember: AuthMember, inquiryId: string): Promise<T> {
		const inquiry = await this.inquiryModel
			.findOne({ _id: this.toObjectId(inquiryId), ...this.scopeOf(authMember) })
			.lean()
			.exec();
		if (!inquiry) throw new NotFoundException(Messages.NO_DATA_FOUND);
		return inquiry;
	}

	private toObjectId(id: string): ObjectId {
		if (!Types.ObjectId.isValid(id)) throw new NotFoundException(Messages.NO_DATA_FOUND);
		return shapeIntoMongoObjectId(id) as ObjectId;
	}
}
