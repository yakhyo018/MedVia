import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Queue } from 'bullmq';

export const BOOKING_QUEUE = 'booking';

export enum BookingJob {
	EXPIRE = 'expire',
	REMIND = 'remind',
	EXPIRY_SWEEP = 'expiry-sweep',
	REMINDER_SWEEP = 'reminder-sweep',
}

export interface BookingJobData {
	bookingId?: string;
}

/** `expire-<bookingId>`: one job per booking, so adding it twice keeps the first. */
export const jobIdOf = (job: BookingJob.EXPIRE | BookingJob.REMIND, bookingId: unknown) =>
	`${job}-${String(bookingId)}`;

/**
 * The sweeps find what a lost job missed (Redis was down, the job failed three times). Job
 * schedulers, not @Cron: with three API instances a cron runs three times, while a scheduled
 * job is taken by one worker.
 */
const SWEEPS = [
	{ name: BookingJob.EXPIRY_SWEEP, every: 5 * 60_000 },
	{ name: BookingJob.REMINDER_SWEEP, every: 60 * 60_000 },
];

/** Keeps a run that never started from stalling the queue state forever. */
const PROMOTE_WAIT_MS = 5_000;

/**
 * The producer: the booking module puts a job on the queue at the moment it knows the time —
 * "expire at respondDeadline" on request, "remind a day before" on confirm. Never awaited and
 * never throws: a booking does not fail because Redis is down; the sweep catches up.
 */
@Injectable()
export class BookingJobs implements OnModuleInit {
	private readonly logger = new Logger(BookingJobs.name);

	constructor(@InjectQueue(BOOKING_QUEUE) private readonly queue: Queue<BookingJobData>) {}

	/** Not awaited: a boot without Redis must not hang here. */
	public onModuleInit(): void {
		for (const sweep of SWEEPS) {
			this.queue
				.upsertJobScheduler(
					sweep.name,
					{ every: sweep.every },
					{ name: sweep.name, opts: { removeOnComplete: true, removeOnFail: 50 } },
				)
				.catch((err) => this.logger.warn(`sweep ${sweep.name} not scheduled: ${err.message}`));
		}
	}

	public scheduleExpiry(bookingId: unknown, at: Date): void {
		this.add(BookingJob.EXPIRE, bookingId, at);
	}

	public scheduleReminder(bookingId: unknown, at: Date): void {
		this.add(BookingJob.REMIND, bookingId, at);
	}

	/**
	 * Test support only: run a delayed job now and wait for it. A completed job is removed, so
	 * "gone" after promoting means it ran.
	 */
	public async promote(jobId: string): Promise<string> {
		const job = await this.queue.getJob(jobId);
		if (!job) return 'missing';
		if ((await job.getState()) === 'delayed') await job.promote();
		const until = Date.now() + PROMOTE_WAIT_MS;
		while (Date.now() < until) {
			const state = await job.getState();
			if (state === 'unknown') return 'completed';
			if (state === 'completed' || state === 'failed') return state;
			await new Promise((resolve) => setTimeout(resolve, 100));
		}
		return await job.getState();
	}

	private add(name: BookingJob.EXPIRE | BookingJob.REMIND, bookingId: unknown, at: Date): void {
		this.queue
			.add(
				name,
				{ bookingId: String(bookingId) },
				{
					jobId: jobIdOf(name, bookingId),
					delay: Math.max(at.getTime() - Date.now(), 0),
					attempts: 3,
					backoff: { type: 'exponential', delay: 30_000 },
					removeOnComplete: true,
					removeOnFail: { age: 7 * 24 * 60 * 60 },
				},
			)
			.catch((err) =>
				this.logger.warn(`${name} for ${String(bookingId)} not queued: ${err.message}`),
			);
	}
}
