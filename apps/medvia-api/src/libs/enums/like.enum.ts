import { registerEnumType } from '@nestjs/graphql';

/** Comments are not liked (M8 review): no heart on a comment in the mockups. */
export enum LikeGroup {
	CLINIC = 'CLINIC',
	DOCTOR = 'DOCTOR',
	ARTICLE = 'ARTICLE',
}
registerEnumType(LikeGroup, { name: 'LikeGroup' });
