import { bayesRating, logShare, meanRating, rankScore, RankContext } from './rank.rules';

const ctx: RankContext = { mean: 4.5, maxCompleted: 100, maxFollowers: 1000 };
const quiet = { completed: 0, followers: 0 };

describe('rank rules', () => {
	it('pulls a rating with few reviews towards the mean', () => {
		expect(bayesRating(5, 1, 4.5)).toBeCloseTo(4.583, 3);
		expect(bayesRating(4.8, 200, 4.5)).toBeCloseTo(4.793, 3);
	});

	it('puts 200 reviews at 4.8 above one review at 5.0', () => {
		const oneFive = rankScore({ rating: 5, reviews: 1, ...quiet }, ctx);
		const manyGood = rankScore({ rating: 4.8, reviews: 200, ...quiet }, ctx);
		expect(manyGood).toBeGreaterThan(oneFive);
	});

	it('gives a clinic with no reviews the mean, not zero', () => {
		expect(bayesRating(0, 0, 4.5)).toBe(4.5);
	});

	it('scores activity and popularity as a log share of the leader', () => {
		expect(logShare(100, 100)).toBe(1);
		expect(logShare(0, 100)).toBe(0);
		expect(logShare(10, 0)).toBe(0);
		expect(logShare(10, 100)).toBeGreaterThan(0.5);
	});

	it('weights the review-weighted mean', () => {
		expect(
			meanRating([
				{ rating: 5, reviews: 1 },
				{ rating: 4, reviews: 3 },
			]),
		).toBe(4.25);
		expect(meanRating([])).toBe(0);
	});

	it('stays within [0, 1] and is rounded to four decimals', () => {
		const top = rankScore({ rating: 5, reviews: 1000, completed: 100, followers: 1000 }, ctx);
		expect(top).toBeLessThanOrEqual(1);
		expect(top).toBeGreaterThan(0.99);
		const score = rankScore({ rating: 4.3, reviews: 7, completed: 3, followers: 12 }, ctx);
		expect(Math.round(score * 10_000) / 10_000).toBe(score);
	});
});
