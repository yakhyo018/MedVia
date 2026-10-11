import { NotFoundException, UseGuards } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Args, Int, Mutation, Resolver } from '@nestjs/graphql';
import { Connection, Model, Types } from 'mongoose';
import { Messages } from '../../libs/enums/common.enum';
import { MemberType } from '../../libs/enums/member.enum';
import { T } from '../../libs/types/common';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { BookingService } from '../booking/booking.service';
import { BookingJobs } from '../booking/booking.jobs';
import { CacheService } from '../../redis/cache.service';
import { CacheKeys } from '../../libs/config';
import { SlotStatus } from '../../libs/enums/booking.enum';

const HOUR = 60 * 60_000;

/** Not production code: see TestSupportModule. */
@Resolver()
export class TestSupportResolver {
	constructor(
		@InjectModel('Booking') private readonly bookingModel: Model<T>,
		@InjectModel('Slot') private readonly slotModel: Model<T>,
		@InjectModel('Clinic') private readonly clinicModel: Model<T>,
		@InjectConnection() private readonly connection: Connection,
		private readonly bookingService: BookingService,
		private readonly bookingJobs: BookingJobs,
		private readonly cacheService: CacheService,
	) {}

	/** Ends a member's slot holds a minute ago, so the batch SLOT_RELEASE has something to free. */
	@Roles(MemberType.ADMIN)
	@UseGuards(RolesGuard)
	@Mutation(() => Int)
	public async devExpireHolds(@Args('memberId') memberId: string): Promise<number> {
		console.log('Mutation: devExpireHolds');
		if (!Types.ObjectId.isValid(memberId)) throw new NotFoundException(Messages.NO_DATA_FOUND);
		const result = await this.slotModel
			.updateMany(
				{ holdMemberId: new Types.ObjectId(memberId), slotStatus: SlotStatus.HELD },
				{ $set: { holdExpiresAt: new Date(Date.now() - 60_000) } },
			)
			.exec();
		return result.modifiedCount;
	}

	/**
	 * Runs a booking sweep now, in this request, and returns how many bookings it changed — the
	 * same code the scheduled job runs. `times` runs that many copies at once: two workers
	 * finding the same booking is the race the conditional writes exist for.
	 */
	@Roles(MemberType.ADMIN)
	@UseGuards(RolesGuard)
	@Mutation(() => Int)
	public async devRunSweep(
		@Args('name') name: string,
		@Args('times', { type: () => Int, defaultValue: 1 }) times: number,
	): Promise<number> {
		console.log('Mutation: devRunSweep');
		const sweep =
			name === 'EXPIRY'
				? () => this.bookingService.expireDue()
				: name === 'REMINDER'
					? () => this.bookingService.remindDue()
					: null;
		if (!sweep || times < 1 || times > 5) throw new NotFoundException(Messages.NO_DATA_FOUND);
		const counts = await Promise.all(Array.from({ length: times }, sweep));
		return counts.reduce((sum, n) => sum + n, 0);
	}

	/**
	 * Runs a delayed job (`expire-<bookingId>`, `remind-<bookingId>`) now and waits for it.
	 * "missing" proves the job was never queued — the producer is under test too.
	 */
	@Roles(MemberType.ADMIN)
	@UseGuards(RolesGuard)
	@Mutation(() => String)
	public async devPromoteJob(@Args('jobId') jobId: string): Promise<string> {
		console.log('Mutation: devPromoteJob');
		return await this.bookingJobs.promote(jobId);
	}

	/** Breaks a clinic's stored counters on purpose, so the batch RECOUNT has something to heal. */
	@Roles(MemberType.ADMIN)
	@UseGuards(RolesGuard)
	@Mutation(() => Boolean)
	public async devDriftClinic(@Args('clinicId') clinicId: string): Promise<boolean> {
		console.log('Mutation: devDriftClinic');
		if (!Types.ObjectId.isValid(clinicId)) throw new NotFoundException(Messages.NO_DATA_FOUND);
		const result = await this.clinicModel
			.updateOne(
				{ _id: clinicId },
				{
					$set: {
						clinicFollowers: 999,
						clinicMinPrice: 1,
						clinicTreatmentNames: ['Drifted'],
						clinicRating: 1,
						clinicReviews: 99,
					},
				},
			)
			.exec();
		if (!result.matchedCount) throw new NotFoundException(Messages.NO_DATA_FOUND);
		// Without this a cached page would still show the right numbers and hide the drift.
		await this.cacheService.del(CacheKeys.clinicDetail(clinicId));
		return true;
	}

	/**
	 * Moves a booking and its slots `hours` into the past, so the suite can reach "the visit has
	 * started" (COMPLETED, then a review) without waiting days. Only the clock is faked: the
	 * status change and the review still go through the real mutations and their rules.
	 */
	@Roles(MemberType.ADMIN)
	@UseGuards(RolesGuard)
	@Mutation(() => Boolean)
	public async devShiftBookingTime(
		@Args('bookingId') bookingId: string,
		@Args('hours', { type: () => Int }) hours: number,
	): Promise<boolean> {
		console.log('Mutation: devShiftBookingTime');
		if (!Types.ObjectId.isValid(bookingId) || hours < 1 || hours > 24 * 90) {
			throw new NotFoundException(Messages.NO_DATA_FOUND);
		}
		const ms = hours * HOUR;
		const session = await this.connection.startSession();
		try {
			await session.withTransaction(async () => {
				const booking = await this.bookingModel
					.findById(bookingId, null, { session })
					.lean()
					.exec();
				if (!booking) throw new NotFoundException(Messages.NO_DATA_FOUND);
				await this.bookingModel
					.updateOne(
						{ _id: booking._id },
						{
							$set: {
								bookingDate: new Date(booking.bookingDate.getTime() - ms),
								respondDeadline: new Date(booking.respondDeadline.getTime() - ms),
							},
						},
						{ session },
					)
					.exec();
				await this.slotModel
					.updateMany(
						{ _id: { $in: booking.slotIds } },
						[{ $set: { slotStart: { $subtract: ['$slotStart', ms] } } }],
						{ session },
					)
					.exec();
			});
		} finally {
			await session.endSession();
		}
		return true;
	}
}
