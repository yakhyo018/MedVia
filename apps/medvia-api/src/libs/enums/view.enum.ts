import { registerEnumType } from '@nestjs/graphql';

/** ARTICLE views count for articleViews only; Recently Visited lists clinics and doctors. */
export enum ViewGroup {
	CLINIC = 'CLINIC',
	DOCTOR = 'DOCTOR',
	ARTICLE = 'ARTICLE',
}
registerEnumType(ViewGroup, { name: 'ViewGroup' });
