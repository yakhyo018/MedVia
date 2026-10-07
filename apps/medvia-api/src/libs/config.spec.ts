import { escapeRegex, toDisplayName } from './config';

describe('toDisplayName', () => {
	it('shortens a patient to first name and initial', () => {
		expect(toDisplayName('Feride Karimova', true)).toBe('Feride K.');
	});

	it('keeps a one-word patient name as it is', () => {
		expect(toDisplayName('Feride', true)).toBe('Feride');
	});

	it('ignores extra spaces around and between the names', () => {
		expect(toDisplayName('  Feride   Karimova ', true)).toBe('Feride K.');
	});

	it('uses only the second word when there are more', () => {
		expect(toDisplayName('Ali Vali Karimov', true)).toBe('Ali V.');
	});

	it('shows clinics and doctors in full', () => {
		expect(toDisplayName('Han Seo-yeon', false)).toBe('Han Seo-yeon');
	});
});

describe('escapeRegex', () => {
	it('makes regex operators literal', () => {
		const pattern = new RegExp(escapeRegex('a.*'), 'i');
		expect(pattern.test('a.*')).toBe(true);
		expect(pattern.test('abc')).toBe(false);
	});

	it('defuses a catastrophic-backtracking pattern into plain text', () => {
		expect(escapeRegex('(a+)+$')).toBe('\\(a\\+\\)\\+\\$');
	});
});
