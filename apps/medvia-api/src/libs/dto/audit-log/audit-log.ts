import { Field, InputType, ObjectType } from '@nestjs/graphql';
import type { ObjectId } from 'mongoose';
import { IsEnum, IsMongoId } from 'class-validator';
import { AuditAction, AuditGroup } from '../../enums/admin.enum';

@ObjectType()
export class AuditLog {
	@Field(() => String)
	_id!: ObjectId;

	@Field(() => AuditAction)
	auditAction!: AuditAction;

	@Field(() => AuditGroup)
	auditGroup!: AuditGroup;

	@Field(() => String)
	auditRefId!: ObjectId;

	@Field(() => String, { nullable: true })
	auditNote?: string;

	/** The admin who decided. */
	@Field(() => String)
	memberId!: ObjectId;

	@Field(() => Date)
	createdAt!: Date;
}

@InputType()
export class AuditLogsInquiry {
	@IsEnum(AuditGroup)
	@Field(() => AuditGroup)
	auditGroup!: AuditGroup;

	@IsMongoId()
	@Field(() => String)
	auditRefId!: string;
}
