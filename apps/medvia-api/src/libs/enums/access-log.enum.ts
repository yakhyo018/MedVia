import { registerEnumType } from '@nestjs/graphql';

/** What was decrypted: the patient's own answers, or the Korean AI summary of them. */
export enum AccessType {
	ANSWERS = 'ANSWERS',
	AI_SUMMARY = 'AI_SUMMARY',
}
registerEnumType(AccessType, { name: 'AccessType' });
