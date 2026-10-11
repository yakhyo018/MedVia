import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { AnyBulkWriteOperation, Model } from 'mongoose';
import { BookingStatus } from '../../../medvia-api/src/libs/enums/booking.enum';
import { ClinicStatus } from '../../../medvia-api/src/libs/enums/clinic.enum';
import { DoctorStatus } from '../../../medvia-api/src/libs/enums/doctor.enum';
import { T } from '../../../medvia-api/src/libs/types/common';
import { CacheKeys } from '../../../medvia-api/src/libs/config';
import { BatchCacheService } from '../batch-cache.service';
import { ACTIVITY_DAYS, meanRating, RankInput, rankScore } from './rank.rules';

const DAY = 24 * 60 * 60_000;

/** Which stored fields of a clinic or a doctor feed the score, and where it is written. */
interface Target {
	model: Model<T>;
	match: T;
	owner: 'clinicId' | 'doctorId';
	fields: { rating: string; reviews: string; followers: string; score: string };
	cache: { detail: (id: unknown) => string; list: string };
}

/**
 * "Recommended": a nightly score for every live clinic and doctor (rank.rules.ts). It reads
 * the stored rating, reviews and followers — RECOUNT has just made them right — plus the
 * completed visits of the last 90 days. Only changed scores are written; then the list caches
 * go, so the new order shows at once instead of after their TTL.
 */
@Injectable()
export class RankService {
	private readonly targets: Target[];

	constructor(
		@InjectModel('Clinic') clinicModel: Model<T>,
		@InjectModel('Doctor') doctorModel: Model<T>,
		@InjectModel('Booking') private readonly bookingModel: Model<T>,
		private readonly cache: BatchCacheService,
	) {
		this.targets = [
			{
				model: clinicModel,
				match: { clinicStatus: ClinicStatus.ACTIVE },
				owner: 'clinicId',
				fields: {
					rating: 'clinicRating',
					reviews: 'clinicReviews',
					followers: 'clinicFollowers',
					score: 'clinicScore',
				},
				cache: { detail: CacheKeys.clinicDetail, list: CacheKeys.clinicListPattern },
			},
			{
				model: doctorModel,
				match: { doctorStatus: DoctorStatus.ACTIVE },
				owner: 'doctorId',
				fields: {
					rating: 'doctorRating',
					reviews: 'doctorReviews',
					followers: 'doctorFollowers',
					score: 'doctorScore',
				},
				cache: { detail: CacheKeys.doctorDetail, list: CacheKeys.doctorListPattern },
			},
		];
	}

	public async run(now = new Date()): Promise<string> {
		const [clinics, doctors] = [
			await this.rank(this.targets[0], now),
			await this.rank(this.targets[1], now),
		];
		return `clinics: ${clinics.ranked} ranked, ${clinics.changed} changed; doctors: ${doctors.ranked} ranked, ${doctors.changed} changed`;
	}

	private async rank(target: Target, now: Date) {
		const { model, fields } = target;
		const [rows, completed] = await Promise.all([
			model
				.find(target.match, {
					[fields.rating]: 1,
					[fields.reviews]: 1,
					[fields.followers]: 1,
					[fields.score]: 1,
				})
				.lean()
				.exec(),
			this.completedBy(target.owner, new Date(now.getTime() - ACTIVITY_DAYS * DAY)),
		]);

		const inputs = new Map<string, RankInput>(
			rows.map((row: T) => [
				String(row._id),
				{
					rating: row[fields.rating] ?? 0,
					reviews: row[fields.reviews] ?? 0,
					completed: completed.get(String(row._id)) ?? 0,
					followers: row[fields.followers] ?? 0,
				},
			]),
		);
		const all = [...inputs.values()];
		const ctx = {
			mean: meanRating(all),
			maxCompleted: Math.max(0, ...all.map((i) => i.completed)),
			maxFollowers: Math.max(0, ...all.map((i) => i.followers)),
		};

		const ops: AnyBulkWriteOperation[] = [];
		for (const row of rows) {
			const score = rankScore(inputs.get(String(row._id))!, ctx);
			if (row[fields.score] === score) continue;
			ops.push({
				updateOne: { filter: { _id: row._id }, update: { $set: { [fields.score]: score } } },
			});
		}
		if (ops.length) {
			await model.bulkWrite(ops);
			await this.cache.unlink(ops.map((op: T) => target.cache.detail(op.updateOne.filter._id)));
			await this.cache.unlinkPattern(target.cache.list);
		}
		return { ranked: rows.length, changed: ops.length };
	}

	/** COMPLETED visits since `since`, per clinic or doctor. */
	private async completedBy(owner: 'clinicId' | 'doctorId', since: Date) {
		const rows = await this.bookingModel
			.aggregate([
				{ $match: { bookingStatus: BookingStatus.COMPLETED, bookingDate: { $gte: since } } },
				{ $group: { _id: `$${owner}`, count: { $sum: 1 } } },
			])
			.exec();
		return new Map<string, number>(rows.map((row: T) => [String(row._id), row.count]));
	}
}
