import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, ObjectId } from 'mongoose';
import {
	AuditFeedInquiry,
	AuditLog,
	AuditLogs,
	AuditLogsInquiry,
} from '../../libs/dto/audit-log/audit-log';
import { AuditAction, AuditGroup } from '../../libs/enums/admin.enum';
import { shapeIntoMongoObjectId } from '../../libs/config';
import { auditFeedMatch } from './audit-log.rules';

export interface AuditInput {
	auditAction: AuditAction;
	auditGroup: AuditGroup;
	auditRefId: ObjectId;
	auditNote?: string;
	memberId: ObjectId;
}

/** Append-only: this service inserts and reads. There is no update or delete on purpose. */
@Injectable()
export class AuditLogService {
	constructor(@InjectModel('AuditLog') private readonly auditLogModel: Model<AuditLog>) {}

	public async record(input: AuditInput): Promise<void> {
		await this.auditLogModel.create(input);
	}

	/** The decision history of one clinic (later: treatment, review ...), newest first. */
	public async getAuditLogs(input: AuditLogsInquiry): Promise<AuditLog[]> {
		return (await this.auditLogModel
			.find({ auditGroup: input.auditGroup, auditRefId: shapeIntoMongoObjectId(input.auditRefId) })
			.sort({ createdAt: -1 })
			.lean()
			.exec()) as AuditLog[];
	}

	/** "Recent activity": every decision, newest first, with the admin's name. */
	public async getAuditFeed(input: AuditFeedInquiry): Promise<AuditLogs> {
		const [result] = await this.auditLogModel
			.aggregate([
				{ $match: auditFeedMatch(input) },
				{ $sort: { createdAt: -1, _id: -1 } },
				{
					$facet: {
						list: [
							{ $skip: (input.page - 1) * input.limit },
							{ $limit: input.limit },
							{
								$lookup: {
									from: 'members',
									localField: 'memberId',
									foreignField: '_id',
									pipeline: [{ $project: { memberFullName: 1 } }],
									as: 'admin',
								},
							},
							{ $addFields: { adminName: { $first: '$admin.memberFullName' } } },
							{ $project: { admin: 0 } },
						],
						metaCounter: [{ $count: 'total' }],
					},
				},
			])
			.exec();
		return result as AuditLogs;
	}
}
