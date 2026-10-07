import { BadRequestException } from '@nestjs/common';
import { normalizeHours } from './clinic.rules';

describe('normalizeHours', () => {
	it('sorts the week by day and strips times from closed days', () => {
		expect(
			normalizeHours([
				{ day: 1, open: '10:00', close: '19:00' },
				{ day: 0, closed: true, open: '09:00' },
			]),
		).toEqual([
			{ day: 0, closed: true },
			{ day: 1, open: '10:00', close: '19:00', closed: false },
		]);
	});

	it('refuses the same day twice', () => {
		expect(() =>
			normalizeHours([
				{ day: 2, open: '10:00', close: '19:00' },
				{ day: 2, open: '11:00', close: '18:00' },
			]),
		).toThrow(BadRequestException);
	});

	it('refuses an open day that closes before it opens', () => {
		expect(() => normalizeHours([{ day: 3, open: '19:00', close: '10:00' }])).toThrow(
			BadRequestException,
		);
	});

	it('refuses an open day that opens and closes at the same time', () => {
		expect(() => normalizeHours([{ day: 3, open: '10:00', close: '10:00' }])).toThrow(
			BadRequestException,
		);
	});

	it('refuses an open day without both times', () => {
		expect(() => normalizeHours([{ day: 4, open: '10:00' }])).toThrow(BadRequestException);
	});

	it('accepts an empty week', () => {
		expect(normalizeHours([])).toEqual([]);
	});
});
