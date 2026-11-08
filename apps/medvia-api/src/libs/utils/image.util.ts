/**
 * Image checks with no package: the type from the first bytes, and metadata removal.
 *
 * A phone photo carries EXIF (Exchangeable Image File Format) metadata: GPS coordinates, the
 * time it was taken, the phone model and serial, sometimes a thumbnail of the uncropped
 * original. For a face photo that is personal data nobody asked for, so it is removed before
 * the image goes anywhere — the AI provider included.
 */

export type ImageType = 'jpg' | 'png';

export const IMAGE_MEDIA_TYPE: Record<ImageType, 'image/jpeg' | 'image/png'> = {
	jpg: 'image/jpeg',
	png: 'image/png',
};

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/**
 * The extension comes from the file's first bytes, not from its name or the Content-Type
 * header — both are whatever the client claims. A script renamed to photo.jpg fails here.
 */
export const detectImageType = (buffer: Buffer): ImageType | null => {
	if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff)
		return 'jpg';
	if (buffer.length >= 8 && PNG_SIGNATURE.every((byte, i) => buffer[i] === byte)) return 'png';
	return null;
};

export function stripImageMetadata(buffer: Buffer, type: ImageType): Buffer {
	return type === 'jpg' ? stripJpegMetadata(buffer) : stripPngMetadata(buffer);
}

/**
 * JPEG (Joint Photographic Experts Group) file = SOI (Start Of Image, FF D8), then segments
 * `FF <marker> <2-byte length> <data>` up to SOS (Start Of Scan, FF DA), after which the
 * compressed pixels run to the end. Dropped segments:
 * - APP1  (FF E1) — EXIF and XMP (Extensible Metadata Platform): GPS, camera, dates;
 * - APP13 (FF ED) — Photoshop / IPTC (International Press Telecommunications Council) captions;
 * - COM   (FF FE) — free-text comments.
 * Kept: APP0 (JFIF header), APP2 (ICC colour profile), APP14 (Adobe colour transform) and every
 * segment the decoder needs. Pixels are copied byte for byte — nothing is re-encoded.
 */
function stripJpegMetadata(buffer: Buffer): Buffer {
	const DROP = new Set([0xe1, 0xed, 0xfe]);
	const parts: Buffer[] = [buffer.subarray(0, 2)];
	let offset = 2;
	while (offset < buffer.length) {
		if (buffer[offset] !== 0xff) throw new Error('broken JPEG: expected a marker');
		// A marker may be preceded by any number of FF fill bytes.
		while (buffer[offset + 1] === 0xff) offset++;
		const marker = buffer[offset + 1];
		if (marker === undefined) throw new Error('broken JPEG: cut off at a marker');
		// RST0–7 and TEM carry no length field.
		if ((marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
			parts.push(buffer.subarray(offset, offset + 2));
			offset += 2;
			continue;
		}
		if (marker === 0xd9) {
			parts.push(buffer.subarray(offset, offset + 2)); // EOI (End Of Image)
			break;
		}
		if (offset + 4 > buffer.length) throw new Error('broken JPEG: cut off at a length');
		const length = buffer.readUInt16BE(offset + 2);
		const end = offset + 2 + length;
		if (length < 2 || end > buffer.length) throw new Error('broken JPEG: bad segment length');
		if (marker === 0xda) {
			parts.push(buffer.subarray(offset)); // SOS: the compressed image to the end, as is
			break;
		}
		if (!DROP.has(marker)) parts.push(buffer.subarray(offset, end));
		offset = end;
	}
	return Buffer.concat(parts);
}

/**
 * PNG (Portable Network Graphics) file = 8-byte signature, then chunks
 * `<4-byte length> <4-byte type> <data> <4-byte CRC>` up to IEND. Dropped chunks: eXIf (EXIF),
 * tEXt / zTXt / iTXt (text, plain / compressed / international) and tIME (last modified).
 */
function stripPngMetadata(buffer: Buffer): Buffer {
	const DROP = new Set(['eXIf', 'tEXt', 'zTXt', 'iTXt', 'tIME']);
	const parts: Buffer[] = [buffer.subarray(0, 8)];
	let offset = 8;
	while (offset < buffer.length) {
		if (offset + 12 > buffer.length) throw new Error('broken PNG: cut off at a chunk');
		const length = buffer.readUInt32BE(offset);
		const type = buffer.toString('latin1', offset + 4, offset + 8);
		const end = offset + 12 + length;
		if (end > buffer.length) throw new Error('broken PNG: bad chunk length');
		if (!DROP.has(type)) parts.push(buffer.subarray(offset, end));
		offset = end;
		if (type === 'IEND') break;
	}
	return Buffer.concat(parts);
}
