import { BadRequestException } from '@nestjs/common';
import { ReviewDecision } from '../../libs/enums/admin.enum';
import { BookingStatus } from '../../libs/enums/booking.enum';
import { Messages } from '../../libs/enums/common.enum';
import { ReviewStatus } from '../../libs/enums/review.enum';
import { T } from '../../libs/types/common';

/**
 * The review rules as pure functions, the clock passed in. The service reads, asks these, and
 * writes conditionally on what it read.
 */

export const REVIEW_WINDOW_DAYS = 30;
const DAY = 24 * 60 * 60_000;

/** The patient may change these; HIDDEN and DELETE are the admin's and final. */
export const EDITABLE = [ReviewStatus.PENDING, ReviewStatus.EDIT_REQUESTED, ReviewStatus.ACTIVE];

/**
 * A booking of this patient (the caller already scoped it) that is COMPLETED, within 30 days of
 * the visit's completion, and not reviewed before — not even by a review that was deleted.
 */
export function checkCanReview(booking: T, now: Date): void {
	if (booking.bookingStatus !== BookingStatus.COMPLETED || !booking.completedAt) {
		throw new BadRequestException(Messages.REVIEW_NOT_COMPLETED);
	}
	if (booking.bookingReviewed) throw new BadRequestException(Messages.ALREADY_REVIEWED);
	if (now.getTime() - booking.completedAt.getTime() > REVIEW_WINDOW_DAYS * DAY) {
		throw new BadRequestException(Messages.REVIEW_WINDOW_CLOSED);
	}
}

/**
 * from → decision → to. APPROVE publishes; REQUEST_CHANGES sends it back to the patient with a
 * message; REJECT hides it. A published review can be sent back or hidden after a complaint, a
 * hidden one restored. Anything else is refused.
 */
export const MODERATION: Partial<
	Record<ReviewStatus, Partial<Record<ReviewDecision, ReviewStatus>>>
> = {
	[ReviewStatus.PENDING]: {
		[ReviewDecision.APPROVE]: ReviewStatus.ACTIVE,
		[ReviewDecision.REQUEST_CHANGES]: ReviewStatus.EDIT_REQUESTED,
		[ReviewDecision.REJECT]: ReviewStatus.HIDDEN,
	},
	[ReviewStatus.ACTIVE]: {
		[ReviewDecision.REQUEST_CHANGES]: ReviewStatus.EDIT_REQUESTED,
		[ReviewDecision.REJECT]: ReviewStatus.HIDDEN,
	},
	[ReviewStatus.EDIT_REQUESTED]: {
		[ReviewDecision.REJECT]: ReviewStatus.HIDDEN,
	},
	[ReviewStatus.HIDDEN]: {
		[ReviewDecision.APPROVE]: ReviewStatus.ACTIVE,
	},
};

/** The status a decision leads to. The patient is always told why, unless it is approved. */
export function planModeration(
	from: ReviewStatus,
	decision: ReviewDecision,
	note?: string,
): ReviewStatus {
	const to = MODERATION[from]?.[decision];
	if (!to) throw new BadRequestException(Messages.MODERATION_NOT_ALLOWED);
	if (decision !== ReviewDecision.APPROVE && !note?.trim()) {
		throw new BadRequestException(Messages.REVIEW_MESSAGE_REQUIRED);
	}
	return to;
}

/** Only published reviews count; a change that touches one moves the rating. */
export const movesRating = (from: ReviewStatus, to: ReviewStatus) =>
	from !== to && (from === ReviewStatus.ACTIVE || to === ReviewStatus.ACTIVE);

export interface RatingSummary {
	rating: number;
	reviews: number;
	/** Five rows, 5 stars first, zeros included — the bars of the rating histogram. */
	distribution: { stars: number; count: number }[];
}

/** From `$group: { _id: '$reviewRating', count }` rows to "4.9 · 312 reviews" and the bars. */
export function summarize(groups: { _id: number; count: number }[]): RatingSummary {
	const distribution = [5, 4, 3, 2, 1].map((stars) => ({
		stars,
		count: groups.find((g) => g._id === stars)?.count ?? 0,
	}));
	const reviews = distribution.reduce((sum, row) => sum + row.count, 0);
	const total = distribution.reduce((sum, row) => sum + row.stars * row.count, 0);
	return {
		rating: reviews ? Math.round((total / reviews) * 10) / 10 : 0,
		reviews,
		distribution,
	};
}
