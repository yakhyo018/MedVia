import { AuditAction } from '../../libs/enums/admin.enum';
import { MemberStatus } from '../../libs/enums/member.enum';

/**
 * The audit line for an admin's status change; null when nothing changed (blocking a blocked
 * member is not a second decision).
 */
export function memberAuditAction(from: MemberStatus, to: MemberStatus): AuditAction | null {
	if (from === to) return null;
	if (to === MemberStatus.BLOCK) return AuditAction.MEMBER_BLOCK;
	if (to === MemberStatus.DELETE) return AuditAction.MEMBER_DELETE;
	return from === MemberStatus.BLOCK ? AuditAction.MEMBER_UNBLOCK : AuditAction.MEMBER_RESTORE;
}
