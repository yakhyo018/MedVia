import { NotFoundException, UseGuards } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Args, Int, Mutation, Resolver } from '@nestjs/graphql';
import { Connection, Model, Types } from 'mongoose';
import { Messages } from '../../libs/enums/common.enum';
import { MemberType } from '../../libs/enums/member.enum';
import { T } from '../../libs/types/common';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';

const HOUR = 60 * 60_000;

/** Not production code: see TestSupportModule. */
@Resolver()
export class TestSupportResolver {
	constructor(
		@InjectModel('Booking') private readonly bookingModel: Model<T>,
		@InjectModel('Slot') private readonly slotModel: Model<T>,
		@InjectConnection() private readonly connection: Connection,
	) {}

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
