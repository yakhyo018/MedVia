import { naviRateKey, parseDocId, sourceUrl } from './navi.rules';

describe('navi rules', () => {
	const treatments = new Map([['t1', 'c9']]);

	it('splits a Navi doc id at the first dash', () => {
		expect(parseDocId('clinic-6ad03f')).toEqual({ kind: 'clinic', id: '6ad03f' });
		expect(parseDocId('guide-how-booking-works')).toEqual({
			kind: 'guide',
			id: 'how-booking-works',
		});
		expect(parseDocId('plain')).toEqual({ kind: 'plain', id: '' });
	});

	it('links each source to its page on the site', () => {
		expect(sourceUrl('clinic-c1', treatments)).toBe('/clinics/detail?id=c1');
		expect(sourceUrl('tip-a1', treatments)).toBe('/community/detail?id=a1');
		expect(sourceUrl('faq-f1', treatments)).toBe('/cs');
		expect(sourceUrl('notice-n1', treatments)).toBe('/cs/notice?id=n1');
	});

	it('links a treatment to its clinic, and nothing when the clinic is unknown', () => {
		expect(sourceUrl('treatment-t1', treatments)).toBe('/clinics/detail?id=c9');
		expect(sourceUrl('treatment-t2', treatments)).toBeUndefined();
	});

	it('gives guides no link: they live only in Navi', () => {
		expect(sourceUrl('guide-how-booking-works', treatments)).toBeUndefined();
	});

	it('keys the rate counter by member and minute', () => {
		const now = new Date('2026-11-08T10:00:30Z');
		expect(naviRateKey('m1', now)).toBe(`navi:ask:m1:${Math.floor(now.getTime() / 60_000)}`);
	});
});
