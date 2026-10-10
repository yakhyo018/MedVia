import { registerEnumType } from '@nestjs/graphql';

/** Same life as an article: published at once, hidden by an admin or at 5 reports. */
export enum CommentStatus {
	ACTIVE = 'ACTIVE',
	HIDDEN = 'HIDDEN',
	DELETE = 'DELETE',
}
registerEnumType(CommentStatus, { name: 'CommentStatus' });
