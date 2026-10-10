import { registerEnumType } from '@nestjs/graphql';

/** One collection for both: notices (news from the team) and FAQ answers. */
export enum NoticeCategory {
	NOTICE = 'NOTICE',
	FAQ = 'FAQ',
}
registerEnumType(NoticeCategory, { name: 'NoticeCategory' });

/** HOLD is a draft the public never sees; DELETE is soft. */
export enum NoticeStatus {
	HOLD = 'HOLD',
	ACTIVE = 'ACTIVE',
	DELETE = 'DELETE',
}
registerEnumType(NoticeStatus, { name: 'NoticeStatus' });
