import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { AnyBulkWriteOperation, Model } from 'mongoose';
import { ClinicStatus } from '../../../medvia-api/src/libs/enums/clinic.enum';
import { DoctorStatus } from '../../../medvia-api/src/libs/enums/doctor.enum';
import { MemberType } from '../../../medvia-api/src/libs/enums/member.enum';
import { ReviewStatus } from '../../../medvia-api/src/libs/enums/review.enum';
import { TreatmentStatus } from '../../../medvia-api/src/libs/enums/treatment.enum';
import { T } from '../../../medvia-api/src/libs/types/common';
import { CacheKeys } from '../../../medvia-api/src/libs/config';
import { summarize } from '../../../medvia-api/src/components/review/review.rules';
import { BatchCacheService } from '../batch-cache.service';

type Counts = Map<string, number>;

/**
 * Rebuilds every copied number from its source: followers from `follows`, the clinic's lowest
 * price and treatment names from `treatments`, ratings from `reviews`. The API keeps them up to
 * date as things happen; this heals what drifted (a lost write, two concurrent refreshes).
 * One aggregation per source for all rows, then a write only where the stored value is wrong.
 */
@Injectable()
export class RecountService {
	constructor(
		@InjectModel('Clinic') private readonly clinicModel: Model<T>,
		@InjectModel('Doctor') private readonly doctorModel: Model<T>,
		@InjectModel('Follow') private readonly followModel: Model<T>,
		@InjectModel('Treatment') private readonly treatmentModel: Model<T>,
		@InjectModel('Review') private readonly reviewModel: Model<T>,
		private readonly cache: BatchCacheService,
	) {}

	public async run(): Promise<string> {
		const clinics = await this.recountClinics();
		const doctors = await this.recountDoctors();
		return `clinics: ${this.report(clinics)}; doctors: ${this.report(doctors)}`;
	}

	/** "fixed 2 of 41 (clinicFollowers 1, clinicRating 1)": what drifted, not only how much. */
	private report({ checked, ops }: { checked: number; ops: T[] }): string {
		const fields = new Map<string, number>();
		for (const op of ops) {
			// Mongoose adds updatedAt to the $set it sends; that is not a drifted field.
			for (const field of Object.keys(op.updateOne.update.$set).filter((f) => f !== 'updatedAt')) {
				fields.set(field, (fields.get(field) ?? 0) + 1);
			}
		}
		const detail = [...fields].map(([field, count]) => `${field} ${count}`).join(', ');
		return `fixed ${ops.length} of ${checked}${detail ? ` (${detail})` : ''}`;
	}

	private async recountClinics() {
		const [clinics, followers, treatments, ratings] = await Promise.all([
			this.clinicModel
				.find(
					{ clinicStatus: { $ne: ClinicStatus.DELETE } },
					{
						memberId: 1,
						clinicFollowers: 1,
						clinicMinPrice: 1,
						clinicTreatmentNames: 1,
						clinicRating: 1,
						clinicReviews: 1,
					},
				)
				.lean()
				.exec(),
			this.followersOf(MemberType.AGENT),
			this.treatmentModel
				.aggregate([
					{ $match: { treatmentStatus: TreatmentStatus.ACTIVE } },
					{
						$group: {
							_id: '$clinicId',
							minPrice: { $min: '$treatmentPrice' },
							names: { $addToSet: '$treatmentName' },
						},
					},
				])
				.exec(),
			this.ratingsBy('clinicId'),
		]);
		const summaries = new Map(treatments.map((row: T) => [String(row._id), row]));

		const ops: AnyBulkWriteOperation[] = [];
		for (const clinic of clinics) {
			const summary: T | undefined = summaries.get(String(clinic._id));
			const rating = ratings.get(String(clinic._id)) ?? summarize([]);
			const expected: T = {
				clinicFollowers: followers.get(String(clinic.memberId)) ?? 0,
				clinicMinPrice: summary?.minPrice ?? null,
				clinicTreatmentNames: [...(summary?.names ?? [])].sort(),
				clinicRating: rating.rating,
				clinicReviews: rating.reviews,
			};
			const set = this.differences(clinic, expected);
			if (set) ops.push({ updateOne: { filter: { _id: clinic._id }, update: { $set: set } } });
		}
		if (ops.length) {
			await this.clinicModel.bulkWrite(ops);
			await this.cache.unlink(ops.map((op: T) => CacheKeys.clinicDetail(op.updateOne.filter._id)));
			await this.cache.unlinkPattern(CacheKeys.clinicListPattern);
		}
		return { checked: clinics.length, ops };
	}

	private async recountDoctors() {
		const [doctors, followers, ratings] = await Promise.all([
			this.doctorModel
				.find(
					{ doctorStatus: { $ne: DoctorStatus.DELETE } },
					{ memberId: 1, doctorFollowers: 1, doctorRating: 1, doctorReviews: 1 },
				)
				.lean()
				.exec(),
			this.followersOf(MemberType.DOCTOR),
			this.ratingsBy('doctorId'),
		]);

		const ops: AnyBulkWriteOperation[] = [];
		for (const doctor of doctors) {
			const rating = ratings.get(String(doctor._id)) ?? summarize([]);
			const expected: T = {
				doctorFollowers: followers.get(String(doctor.memberId)) ?? 0,
				doctorRating: rating.rating,
				doctorReviews: rating.reviews,
			};
			const set = this.differences(doctor, expected);
			if (set) ops.push({ updateOne: { filter: { _id: doctor._id }, update: { $set: set } } });
		}
		if (ops.length) {
			await this.doctorModel.bulkWrite(ops);
			await this.cache.unlink(ops.map((op: T) => CacheKeys.doctorDetail(op.updateOne.filter._id)));
			await this.cache.unlinkPattern(CacheKeys.doctorListPattern);
		}
		return { checked: doctors.length, ops };
	}

	/** Follows per followed account (a clinic's or a doctor's memberId). */
	private async followersOf(type: MemberType): Promise<Counts> {
		const rows = await this.followModel
			.aggregate([
				{ $match: { followingType: type } },
				{ $group: { _id: '$followingId', count: { $sum: 1 } } },
			])
			.exec();
		return new Map(rows.map((row: T) => [String(row._id), row.count]));
	}

	/** ACTIVE reviews per clinic or doctor, summarised exactly as the review module does. */
	private async ratingsBy(field: 'clinicId' | 'doctorId') {
		const rows = await this.reviewModel
			.aggregate([
				{ $match: { reviewStatus: ReviewStatus.ACTIVE } },
				{ $group: { _id: { owner: `$${field}`, stars: '$reviewRating' }, count: { $sum: 1 } } },
			])
			.exec();
		const groups = new Map<string, { _id: number; count: number }[]>();
		for (const row of rows) {
			const owner = String(row._id.owner);
			groups.set(owner, [...(groups.get(owner) ?? []), { _id: row._id.stars, count: row.count }]);
		}
		return new Map([...groups].map(([owner, list]) => [owner, summarize(list)]));
	}

	/** Only the fields whose stored value is wrong; null when the row is right. */
	private differences(stored: T, expected: T): T | null {
		const set: T = {};
		for (const [field, value] of Object.entries(expected)) {
			if (JSON.stringify(stored[field] ?? null) !== JSON.stringify(value)) set[field] = value;
		}
		return Object.keys(set).length ? set : null;
	}
}
