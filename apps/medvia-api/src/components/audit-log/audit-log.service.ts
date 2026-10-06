import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, ObjectId } from 'mongoose';
import { AuditLog, AuditLogsInquiry } from '../../libs/dto/audit-log/audit-log';
import { AuditAction, AuditGroup } from '../../libs/enums/admin.enum';
import { shapeIntoMongoObjectId } from '../../libs/config';

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
}
