import { registerEnumType } from '@nestjs/graphql';

/** ARTICLE joins in M8. */
export enum ViewGroup {
	CLINIC = 'CLINIC',
	DOCTOR = 'DOCTOR',
}
registerEnumType(ViewGroup, { name: 'ViewGroup' });
