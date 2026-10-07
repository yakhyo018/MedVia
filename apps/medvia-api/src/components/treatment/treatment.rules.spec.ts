import { planLiveEdit } from './treatment.rules';

const NOW = new Date('2026-10-07T09:00:00Z');
const EARLIER = new Date('2026-10-07T08:00:00Z');

/** A live treatment as the database returns it. */
const live = (extra: object = {}) => ({
	treatmentName: 'Laser Toning',
	treatmentCategory: 'PIGMENTATION',
	treatmentPrice: 120000,
	treatmentPriceNote: 'Per session',
	treatmentDesc: 'Low-energy laser.',
	treatmentImages: ['uploads/treatment/a.png'],
	treatmentDuration: 30,
	...extra,
});

describe('planLiveEdit — price', () => {
	it('applies a higher price at once, with no draft', () => {
		expect(planLiveEdit(live(), { treatmentPrice: 150000 }, NOW)).toEqual({
			set: { treatmentPrice: 150000 },
			unset: {},
		});
	});

	it('sends a lower price to the draft and leaves the live price alone', () => {
		expect(planLiveEdit(live(), { treatmentPrice: 80000 }, NOW)).toEqual({
			set: { treatmentDraft: { treatmentPrice: 80000, submittedAt: NOW } },
			unset: {},
		});
	});

	it('does nothing for the same price', () => {
		expect(planLiveEdit(live(), { treatmentPrice: 120000 }, NOW)).toEqual({ set: {}, unset: {} });
	});

	it('clears a waiting lower price when the clinic then raises it', () => {
		const current = live({ treatmentDraft: { treatmentPrice: 80000, submittedAt: EARLIER } });
		expect(planLiveEdit(current, { treatmentPrice: 130000 }, NOW)).toEqual({
			set: { treatmentPrice: 130000 },
			unset: { treatmentDraft: 1 },
		});
	});

	it('keeps the other draft fields when a raise clears the draft price', () => {
		const current = live({
			treatmentDraft: { treatmentPrice: 80000, treatmentDesc: 'New text.', submittedAt: EARLIER },
		});
		expect(planLiveEdit(current, { treatmentPrice: 130000 }, NOW)).toEqual({
			set: {
				treatmentPrice: 130000,
				treatmentDraft: { treatmentDesc: 'New text.', submittedAt: NOW },
			},
			unset: {},
		});
	});
});

describe('planLiveEdit — medical-ad fields', () => {
	it('puts a new description into the draft', () => {
		const plan = planLiveEdit(live(), { treatmentDesc: 'Now with a skin check.' }, NOW);
		expect(plan.set).toEqual({
			treatmentDraft: { treatmentDesc: 'Now with a skin check.', submittedAt: NOW },
		});
	});

	it('merges a new edit into the waiting draft and moves its version', () => {
		const current = live({ treatmentDraft: { treatmentPrice: 80000, submittedAt: EARLIER } });
		const plan = planLiveEdit(current, { treatmentName: 'Laser Toning Plus' }, NOW);
		expect(plan.set.treatmentDraft).toEqual({
			treatmentPrice: 80000,
			treatmentName: 'Laser Toning Plus',
			submittedAt: NOW,
		});
	});

	it('drops a draft field set back to the live value, and the draft when it is empty', () => {
		const current = live({ treatmentDraft: { treatmentDesc: 'Changed.', submittedAt: EARLIER } });
		expect(planLiveEdit(current, { treatmentDesc: 'Low-energy laser.' }, NOW)).toEqual({
			set: {},
			unset: { treatmentDraft: 1 },
		});
	});

	it('compares arrays by value, not by reference', () => {
		const plan = planLiveEdit(live(), { treatmentImages: ['uploads/treatment/a.png'] }, NOW);
		expect(plan).toEqual({ set: {}, unset: {} });
	});
});

describe('planLiveEdit — operational fields and untouched drafts', () => {
	it('applies duration, languages and aftercare at once', () => {
		const plan = planLiveEdit(
			live(),
			{ treatmentDuration: 40, treatmentLangs: ['KO', 'RU'], treatmentAftercare: 'SPF 50.' },
			NOW,
		);
		expect(plan).toEqual({
			set: { treatmentDuration: 40, treatmentLangs: ['KO', 'RU'], treatmentAftercare: 'SPF 50.' },
			unset: {},
		});
	});

	it('leaves a waiting draft alone when only operational fields change', () => {
		const current = live({ treatmentDraft: { treatmentPrice: 80000, submittedAt: EARLIER } });
		expect(planLiveEdit(current, { treatmentDuration: 45 }, NOW)).toEqual({
			set: { treatmentDuration: 45 },
			unset: {},
		});
	});

	it('mixes all three outcomes in one edit', () => {
		const plan = planLiveEdit(
			live(),
			{ treatmentDuration: 40, treatmentPrice: 150000, treatmentDesc: 'New.' },
			NOW,
		);
		expect(plan).toEqual({
			set: {
				treatmentDuration: 40,
				treatmentPrice: 150000,
				treatmentDraft: { treatmentDesc: 'New.', submittedAt: NOW },
			},
			unset: {},
		});
	});
});
