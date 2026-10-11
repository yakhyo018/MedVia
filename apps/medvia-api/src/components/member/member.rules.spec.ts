import { AuditAction } from '../../libs/enums/admin.enum';
import { MemberStatus } from '../../libs/enums/member.enum';
import { memberAuditAction } from './member.rules';

const { ACTIVE, BLOCK, DELETE } = MemberStatus;

describe('memberAuditAction', () => {
	it('names every real change', () => {
		expect(memberAuditAction(ACTIVE, BLOCK)).toBe(AuditAction.MEMBER_BLOCK);
		expect(memberAuditAction(BLOCK, ACTIVE)).toBe(AuditAction.MEMBER_UNBLOCK);
		expect(memberAuditAction(ACTIVE, DELETE)).toBe(AuditAction.MEMBER_DELETE);
		expect(memberAuditAction(BLOCK, DELETE)).toBe(AuditAction.MEMBER_DELETE);
		expect(memberAuditAction(DELETE, ACTIVE)).toBe(AuditAction.MEMBER_RESTORE);
	});

	it('records nothing when the status stays', () => {
		for (const status of [ACTIVE, BLOCK, DELETE])
			expect(memberAuditAction(status, status)).toBeNull();
	});
});
