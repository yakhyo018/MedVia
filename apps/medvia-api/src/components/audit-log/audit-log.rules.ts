import { AuditFeedInquiry } from '../../libs/dto/audit-log/audit-log';
import { T } from '../../libs/types/common';
import { shapeIntoMongoObjectId } from '../../libs/config';

/** The feed's filter: only what was asked for; a date range is inclusive at both ends. */
export function auditFeedMatch(input: Partial<AuditFeedInquiry>): T {
	const match: T = {};
	if (input.auditGroup) match.auditGroup = input.auditGroup;
	if (input.auditAction) match.auditAction = input.auditAction;
	if (input.memberId) match.memberId = shapeIntoMongoObjectId(input.memberId);
	if (input.from || input.to) {
		match.createdAt = {};
		if (input.from) match.createdAt.$gte = input.from;
		if (input.to) match.createdAt.$lte = input.to;
	}
	return match;
}
