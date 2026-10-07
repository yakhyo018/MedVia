import { registerEnumType } from '@nestjs/graphql';

/** ARTICLE and COMMENT join in M8. */
export enum LikeGroup {
	CLINIC = 'CLINIC',
	DOCTOR = 'DOCTOR',
}
registerEnumType(LikeGroup, { name: 'LikeGroup' });
