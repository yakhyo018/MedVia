import { randomBytes } from 'crypto';
import { decrypt, encrypt, parseKey } from './crypto.util';

const KEY = randomBytes(32);
const ANSWERS = JSON.stringify([
	{ question: 'Allergies', answer: 'Аллергия на пенициллин' },
	{ question: 'Laser before', answer: "Yo'q" },
]);

describe('encrypt / decrypt', () => {
	it('round-trips UTF-8 text (Cyrillic, Uzbek apostrophes)', () => {
		expect(decrypt(encrypt(ANSWERS, KEY), KEY)).toBe(ANSWERS);
	});

	it('never stores the plain text', () => {
		const stored = encrypt(ANSWERS, KEY);
		expect(stored.startsWith('v1:')).toBe(true);
		expect(stored).not.toContain('пенициллин');
		expect(stored).not.toContain('Allergies');
	});

	it('gives a different value for the same text every time (random IV)', () => {
		expect(encrypt(ANSWERS, KEY)).not.toBe(encrypt(ANSWERS, KEY));
	});

	it('refuses a value changed in the database (GCM tag)', () => {
		const [v, iv, tag, data] = encrypt(ANSWERS, KEY).split(':');
		const bytes = Buffer.from(data, 'base64');
		bytes[0] ^= 1;
		const tampered = [v, iv, tag, bytes.toString('base64')].join(':');
		expect(() => decrypt(tampered, KEY)).toThrow();
	});

	it('refuses the wrong key', () => {
		expect(() => decrypt(encrypt(ANSWERS, KEY), randomBytes(32))).toThrow();
	});

	it('refuses an unknown format', () => {
		expect(() => decrypt('plain text', KEY)).toThrow('Unknown encrypted value format');
	});
});

describe('parseKey', () => {
	it('accepts 32 bytes in base64', () => {
		expect(parseKey(KEY.toString('base64'))).toEqual(KEY);
	});

	it.each([undefined, '', 'short', randomBytes(16).toString('base64')])('refuses %p', (value) => {
		expect(() => parseKey(value)).toThrow('MEDICAL_ENC_KEY must be 32 bytes');
	});
});
