import { Types } from 'mongoose';
import { AuditAction, AuditGroup } from '../../libs/enums/admin.enum';
import { auditFeedMatch } from './audit-log.rules';

describe('auditFeedMatch', () => {
	it('matches everything when nothing is asked', () => {
		expect(auditFeedMatch({ page: 1, limit: 10 })).toEqual({});
	});

	it('narrows by group, action and admin', () => {
		const adminId = new Types.ObjectId().toString();
		const match = auditFeedMatch({
			auditGroup: AuditGroup.MEMBER,
			auditAction: AuditAction.MEMBER_BLOCK,
			memberId: adminId,
		});
		expect(match.auditGroup).toBe(AuditGroup.MEMBER);
		expect(match.auditAction).toBe(AuditAction.MEMBER_BLOCK);
		expect(String(match.memberId)).toBe(adminId);
	});

	it('takes a date range inclusive at both ends, or one end only', () => {
		const from = new Date('2026-10-01T00:00:00Z');
		const to = new Date('2026-10-31T23:59:59Z');
		expect(auditFeedMatch({ from, to }).createdAt).toEqual({ $gte: from, $lte: to });
		expect(auditFeedMatch({ from }).createdAt).toEqual({ $gte: from });
	});
});
