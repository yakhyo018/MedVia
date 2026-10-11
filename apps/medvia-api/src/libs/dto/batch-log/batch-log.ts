import { Field, Int, ObjectType } from '@nestjs/graphql';
import { BatchName, BatchStatus } from '../../enums/batch.enum';

/** The last run of one batch; null fields when it never ran. */
@ObjectType()
export class BatchRun {
	@Field(() => BatchName)
	batchName!: BatchName;

	@Field(() => BatchStatus, { nullable: true })
	batchStatus?: BatchStatus;

	@Field(() => String, { nullable: true })
	batchResult?: string;

	@Field(() => Date, { nullable: true })
	startedAt?: Date;

	@Field(() => Date, { nullable: true })
	finishedAt?: Date;
}

/** The API's booking queue: jobs waiting for their time, ready, running, failed. */
@ObjectType()
export class QueueCounts {
	@Field(() => Int)
	delayed!: number;

	@Field(() => Int)
	waiting!: number;

	@Field(() => Int)
	active!: number;

	@Field(() => Int)
	failed!: number;
}

/** The dashboard's "Batch jobs" card. `queue` is null when Redis does not answer. */
@ObjectType()
export class BatchStatusView {
	@Field(() => [BatchRun])
	batches!: BatchRun[];

	@Field(() => QueueCounts, { nullable: true })
	queue?: QueueCounts;
}
