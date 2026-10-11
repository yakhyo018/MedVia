import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { SlotStatus } from '../../../medvia-api/src/libs/enums/booking.enum';
import { T } from '../../../medvia-api/src/libs/types/common';

/**
 * Housekeeping, not correctness: the API already treats a hold that ran out as free. This
 * writes it as OPEN so the slot table and the clinic's calendar stop showing stale holds.
 * Only holds without a booking — a request's slots are released with the request (expiry).
 */
@Injectable()
export class SlotReleaseService {
	constructor(@InjectModel('Slot') private readonly slotModel: Model<T>) {}

	public async run(now = new Date()): Promise<string> {
		const result = await this.slotModel
			.updateMany(
				{ slotStatus: SlotStatus.HELD, holdExpiresAt: { $lte: now }, bookingId: null },
				{ $set: { slotStatus: SlotStatus.OPEN }, $unset: { holdExpiresAt: 1, holdMemberId: 1 } },
			)
			.exec();
		return `released ${result.modifiedCount} hold(s)`;
	}
}
