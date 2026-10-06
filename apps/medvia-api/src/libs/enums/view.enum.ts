import { registerEnumType } from '@nestjs/graphql';

/** DOCTOR and ARTICLE join in M3 and M8. */
export enum ViewGroup {
	CLINIC = 'CLINIC',
}
registerEnumType(ViewGroup, { name: 'ViewGroup' });
