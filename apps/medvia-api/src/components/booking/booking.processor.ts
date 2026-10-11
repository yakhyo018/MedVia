import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { BookingService } from './booking.service';
import { BOOKING_QUEUE, BookingJob, BookingJobData } from './booking.jobs';

/**
 * The consumer, inside the API process: the jobs are a few writes each, and running them here
 * lets them use BookingService — the same transaction, the same notifications, the socket push.
 * Every job reads the booking again and changes it only if it is still due, so a job that runs
 * twice, or races the sweep or a lazy expiry, changes the booking once.
 *
 * The producer does not know where this runs: moving it to its own process is moving this file.
 */
@Processor(BOOKING_QUEUE)
export class BookingProcessor extends WorkerHost {
	private readonly logger = new Logger(BookingProcessor.name);

	constructor(private readonly bookingService: BookingService) {
		super();
	}

	/** Returns how many bookings changed; a throw makes BullMQ retry (attempts: 3). */
	public async process(job: Job<BookingJobData>): Promise<number> {
		const { bookingId } = job.data;
		let changed = 0;
		if (job.name === BookingJob.EXPIRE) changed = await this.bookingService.expireDue(bookingId);
		else if (job.name === BookingJob.REMIND)
			changed = await this.bookingService.remindDue(bookingId);
		else if (job.name === BookingJob.EXPIRY_SWEEP) changed = await this.bookingService.expireDue();
		else if (job.name === BookingJob.REMINDER_SWEEP)
			changed = await this.bookingService.remindDue();
		else this.logger.warn(`unknown job ${job.name}`);

		if (changed) this.logger.log(`${job.name}: ${changed} booking(s)`);
		return changed;
	}
}
