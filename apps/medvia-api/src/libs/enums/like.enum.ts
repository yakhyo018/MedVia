import { registerEnumType } from '@nestjs/graphql';

/** DOCTOR, ARTICLE and COMMENT join in M3 and M8. */
export enum LikeGroup {
	CLINIC = 'CLINIC',
}
registerEnumType(LikeGroup, { name: 'LikeGroup' });
