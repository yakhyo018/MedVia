import { ReviewDecision } from '../../libs/enums/admin.enum';
import { BookingStatus } from '../../libs/enums/booking.enum';
import { Messages } from '../../libs/enums/common.enum';
import { ReviewStatus } from '../../libs/enums/review.enum';
import { checkCanReview, MODERATION, movesRating, planModeration, summarize } from './review.rules';

const NOW = new Date('2026-10-07T09:00:00Z');
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 24 * 60 * 60_000);

const completed = (extra: object = {}) => ({
	bookingStatus: BookingStatus.COMPLETED,
	completedAt: daysAgo(3),
	bookingReviewed: false,
	...extra,
});

describe('checkCanReview', () => {
	it('accepts a completed visit within 30 days', () => {
		expect(() => checkCanReview(completed(), NOW)).not.toThrow();
		expect(() => checkCanReview(completed({ completedAt: daysAgo(30) }), NOW)).not.toThrow();
	});

	it.each([BookingStatus.CONFIRMED, BookingStatus.CANCELLED, BookingStatus.NO_SHOW])(
		'refuses a %s booking',
		(bookingStatus) => {
			expect(() => checkCanReview(completed({ bookingStatus }), NOW)).toThrow(
				Messages.REVIEW_NOT_COMPLETED,
			);
		},
	);

	it('refuses after 30 days', () => {
		expect(() => checkCanReview(completed({ completedAt: daysAgo(31) }), NOW)).toThrow(
			Messages.REVIEW_WINDOW_CLOSED,
		);
	});

	it('refuses a second review, also when the first was deleted', () => {
		expect(() => checkCanReview(completed({ bookingReviewed: true }), NOW)).toThrow(
			Messages.ALREADY_REVIEWED,
		);
	});
});

describe('planModeration', () => {
	it('publishes, sends back and hides a new review', () => {
		expect(planModeration(ReviewStatus.PENDING, ReviewDecision.APPROVE)).toBe(ReviewStatus.ACTIVE);
		expect(
			planModeration(ReviewStatus.PENDING, ReviewDecision.REQUEST_CHANGES, 'No guarantees'),
		).toBe(ReviewStatus.EDIT_REQUESTED);
		expect(planModeration(ReviewStatus.PENDING, ReviewDecision.REJECT, 'Personal data')).toBe(
			ReviewStatus.HIDDEN,
		);
	});

	it('hides a published review after a complaint and restores a hidden one', () => {
		expect(planModeration(ReviewStatus.ACTIVE, ReviewDecision.REJECT, 'Complaint')).toBe(
			ReviewStatus.HIDDEN,
		);
		expect(planModeration(ReviewStatus.HIDDEN, ReviewDecision.APPROVE)).toBe(ReviewStatus.ACTIVE);
	});

	it('needs a message for the patient unless it approves', () => {
		expect(() => planModeration(ReviewStatus.PENDING, ReviewDecision.REQUEST_CHANGES, ' ')).toThrow(
			Messages.REVIEW_MESSAGE_REQUIRED,
		);
		expect(() => planModeration(ReviewStatus.ACTIVE, ReviewDecision.REJECT)).toThrow(
			Messages.REVIEW_MESSAGE_REQUIRED,
		);
	});

	it('refuses every decision not in the table', () => {
		let refused = 0;
		for (const from of Object.values(ReviewStatus))
			for (const decision of Object.values(ReviewDecision)) {
				if (MODERATION[from]?.[decision]) continue;
				expect(() => planModeration(from, decision, 'note')).toThrow(
					Messages.MODERATION_NOT_ALLOWED,
				);
				refused++;
			}
		// 5 statuses × 3 decisions, 7 allowed.
		expect(refused).toBe(8);
	});
});

describe('movesRating', () => {
	it('is true only when a published review enters or leaves', () => {
		expect(movesRating(ReviewStatus.PENDING, ReviewStatus.ACTIVE)).toBe(true);
		expect(movesRating(ReviewStatus.ACTIVE, ReviewStatus.HIDDEN)).toBe(true);
		expect(movesRating(ReviewStatus.ACTIVE, ReviewStatus.PENDING)).toBe(true);
		expect(movesRating(ReviewStatus.PENDING, ReviewStatus.HIDDEN)).toBe(false);
		expect(movesRating(ReviewStatus.ACTIVE, ReviewStatus.ACTIVE)).toBe(false);
	});
});

describe('summarize', () => {
	it('averages to one decimal and fills the five bars', () => {
		expect(
			summarize([
				{ _id: 5, count: 3 },
				{ _id: 4, count: 1 },
			]),
		).toEqual({
			rating: 4.8,
			reviews: 4,
			distribution: [
				{ stars: 5, count: 3 },
				{ stars: 4, count: 1 },
				{ stars: 3, count: 0 },
				{ stars: 2, count: 0 },
				{ stars: 1, count: 0 },
			],
		});
	});

	it('is 0 with no reviews, never NaN', () => {
		expect(summarize([])).toMatchObject({ rating: 0, reviews: 0 });
	});

	it('rounds half up: 4.25 → 4.3', () => {
		const groups = [
			{ _id: 5, count: 1 },
			{ _id: 4, count: 3 },
		];
		expect(summarize(groups).rating).toBe(4.3);
	});
});
