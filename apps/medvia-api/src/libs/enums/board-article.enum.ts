import { registerEnumType } from '@nestjs/graphql';

/**
 * The community boards. "Treatment Reviews" is not a category: that tab lists the verified M6
 * reviews (getReviews). NEWS shares the Health Tips tab, so it is folded into HEALTH_TIP.
 */
export enum BoardArticleCategory {
	QNA = 'QNA',
	HEALTH_TIP = 'HEALTH_TIP',
	FREE = 'FREE',
}
registerEnumType(BoardArticleCategory, { name: 'BoardArticleCategory' });

/**
 * ACTIVE ──► HIDDEN   (an admin, or automatically at 5 reports)
 * HIDDEN ──► ACTIVE   (an admin)
 * any ──► DELETE      (the author; soft)
 *
 * Published at once and moderated after reports. No DRAFT: the frontend keeps a draft.
 */
export enum BoardArticleStatus {
	ACTIVE = 'ACTIVE',
	HIDDEN = 'HIDDEN',
	DELETE = 'DELETE',
}
registerEnumType(BoardArticleStatus, { name: 'BoardArticleStatus' });
