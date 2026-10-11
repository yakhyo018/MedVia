/**
 * The batch's scheduled runs, logged in `batchLogs`. Not GraphQL enums yet: the admin screen
 * that lists them arrives with M10.
 */
export enum BatchName {
	SLOT_RELEASE = 'SLOT_RELEASE',
	RECOUNT = 'RECOUNT',
	RANK = 'RANK',
}

export enum BatchStatus {
	RUNNING = 'RUNNING',
	SUCCESS = 'SUCCESS',
	FAILED = 'FAILED',
}
