import { registerEnumType } from '@nestjs/graphql';

export enum AssistantSessionStatus {
	ACTIVE = 'ACTIVE',
	CLOSED = 'CLOSED',
}
registerEnumType(AssistantSessionStatus, { name: 'AssistantSessionStatus' });
