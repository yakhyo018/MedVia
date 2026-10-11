import { registerEnumType } from '@nestjs/graphql';

/** The batch's scheduled runs, logged in `batchLogs` and shown on the admin dashboard. */
export enum BatchName {
	SLOT_RELEASE = 'SLOT_RELEASE',
	RECOUNT = 'RECOUNT',
	RANK = 'RANK',
}
registerEnumType(BatchName, { name: 'BatchName' });

export enum BatchStatus {
	RUNNING = 'RUNNING',
	SUCCESS = 'SUCCESS',
	FAILED = 'FAILED',
}
registerEnumType(BatchStatus, { name: 'BatchStatus' });
