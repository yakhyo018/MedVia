/**
 * The "Recommended" score as pure functions — the same idea as IMDb's Top 250: a rating is
 * trusted in proportion to how many reviews stand behind it.
 *
 *   score = 0.6 · bayes(rating) / 5  +  0.25 · activity  +  0.15 · popularity
 *
 * Every part is in [0, 1], so the score is too.
 */

/** "m": a clinic's own rating counts as much as the global mean only after this many reviews. */
export const PRIOR_REVIEWS = 5;
/** Completed visits in this many days make the activity part. */
export const ACTIVITY_DAYS = 90;
export const WEIGHTS = { rating: 0.6, activity: 0.25, popularity: 0.15 };

export interface RankInput {
	rating: number;
	reviews: number;
	completed: number;
	followers: number;
}

export interface RankContext {
	/** The review-weighted mean rating over everyone ranked: "C". */
	mean: number;
	maxCompleted: number;
	maxFollowers: number;
}

/**
 * (v·R + m·C) / (v + m): with few reviews the rating is pulled to the mean — one 5.0 review
 * does not beat two hundred at 4.8.
 */
export function bayesRating(rating: number, reviews: number, mean: number, m = PRIOR_REVIEWS) {
	return (reviews * rating + m * mean) / (reviews + m);
}

/**
 * log(1 + x) / log(1 + max): a share of the leader, on a log scale, so the biggest clinic
 * does not flatten everyone else to zero.
 */
export function logShare(value: number, max: number): number {
	if (max <= 0 || value <= 0) return 0;
	return Math.log1p(value) / Math.log1p(max);
}

/** Σ(rating · reviews) / Σ reviews; 0 when nobody has a review yet. */
export function meanRating(rows: { rating: number; reviews: number }[]): number {
	const reviews = rows.reduce((sum, r) => sum + r.reviews, 0);
	if (!reviews) return 0;
	return rows.reduce((sum, r) => sum + r.rating * r.reviews, 0) / reviews;
}

/** Four decimals: enough to order, and a re-run with the same data writes the same number. */
export function rankScore(input: RankInput, ctx: RankContext): number {
	const score =
		(WEIGHTS.rating * bayesRating(input.rating, input.reviews, ctx.mean)) / 5 +
		WEIGHTS.activity * logShare(input.completed, ctx.maxCompleted) +
		WEIGHTS.popularity * logShare(input.followers, ctx.maxFollowers);
	return Math.round(score * 10_000) / 10_000;
}
