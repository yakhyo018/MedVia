import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

/**
 * Field-level encryption for medical data: AES-256-GCM with Node's own crypto, no package.
 *
 * Atlas already encrypts the disk and the wire; this protects the value from anyone who can
 * *read* the database — a Compass session, a leaked dump, a leaked connection string. The key
 * lives only in the API's environment, never next to the data.
 *
 * Stored form: `v1:<iv>:<tag>:<data>`, each part base64.
 * - v1   which key encrypted it, so the key can be rotated later;
 * - iv   12 random bytes, new every time: equal answers never produce equal text;
 * - tag  GCM's 16-byte seal: one changed byte and decrypt throws instead of returning garbage.
 */

const ALGORITHM = 'aes-256-gcm';
const KEY_VERSION = 'v1';
const IV_BYTES = 12;
const KEY_BYTES = 32;

/** MEDICAL_ENC_KEY as a Buffer; anything but 32 bytes is refused. */
export function parseKey(base64: string | undefined): Buffer {
	const key = Buffer.from(base64 ?? '', 'base64');
	if (key.length !== KEY_BYTES) {
		throw new Error(`MEDICAL_ENC_KEY must be ${KEY_BYTES} bytes, base64 encoded`);
	}
	return key;
}

export function encrypt(plain: string, key: Buffer): string {
	const iv = randomBytes(IV_BYTES);
	const cipher = createCipheriv(ALGORITHM, key, iv);
	const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
	const tag = cipher.getAuthTag();
	return [KEY_VERSION, iv.toString('base64'), tag.toString('base64'), data.toString('base64')].join(
		':',
	);
}

export function decrypt(stored: string, key: Buffer): string {
	const [version, iv, tag, data] = stored.split(':');
	if (version !== KEY_VERSION || !iv || !tag || data === undefined) {
		throw new Error('Unknown encrypted value format');
	}
	const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(iv, 'base64'));
	decipher.setAuthTag(Buffer.from(tag, 'base64'));
	return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString(
		'utf8',
	);
}
