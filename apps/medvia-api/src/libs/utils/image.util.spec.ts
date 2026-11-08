import { detectImageType, stripImageMetadata } from './image.util';

/** A JPEG segment: FF <marker> <2-byte length incl. itself> <data>. */
const seg = (marker: number, data: string) => {
	const body = Buffer.from(data, 'latin1');
	const head = Buffer.from([0xff, marker, 0, 0]);
	head.writeUInt16BE(body.length + 2, 2);
	return Buffer.concat([head, body]);
};
const SOI = Buffer.from([0xff, 0xd8]);
const SOS_AND_PIXELS = Buffer.concat([
	seg(0xda, 'scan-header'),
	Buffer.from('PIXELS\xff\xd9', 'latin1'),
]);

/** A PNG chunk: <4-byte length> <type> <data> <4-byte CRC (not checked here)>. */
const chunk = (type: string, data: string) => {
	const body = Buffer.from(data, 'latin1');
	const length = Buffer.alloc(4);
	length.writeUInt32BE(body.length);
	return Buffer.concat([length, Buffer.from(type, 'latin1'), body, Buffer.alloc(4)]);
};
const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

describe('detectImageType', () => {
	it('reads the type from the first bytes, not the name', () => {
		expect(detectImageType(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe('jpg');
		expect(detectImageType(PNG_SIG)).toBe('png');
		expect(detectImageType(Buffer.from('<script>alert(1)</script>'))).toBeNull();
	});
});

describe('stripImageMetadata — JPEG', () => {
	const jpeg = Buffer.concat([
		SOI,
		seg(0xe0, 'JFIF\0'),
		seg(0xe1, 'Exif\0\0GPS 37.5665,126.9780 iPhone 15'),
		seg(0xe2, 'ICC_PROFILE'),
		seg(0xfe, 'a comment'),
		seg(0xdb, 'quant-table'),
		SOS_AND_PIXELS,
	]);

	it('drops EXIF (APP1) and comments (COM), keeps JFIF, ICC and the pixels', () => {
		const out = stripImageMetadata(jpeg, 'jpg').toString('latin1');
		expect(out).not.toContain('GPS');
		expect(out).not.toContain('a comment');
		expect(out).toContain('JFIF');
		expect(out).toContain('ICC_PROFILE');
		expect(out).toContain('quant-table');
		expect(out.endsWith('PIXELS\xff\xd9')).toBe(true);
	});

	it('leaves a clean JPEG byte for byte the same', () => {
		const clean = Buffer.concat([SOI, seg(0xe0, 'JFIF\0'), SOS_AND_PIXELS]);
		expect(stripImageMetadata(clean, 'jpg').equals(clean)).toBe(true);
	});

	it('refuses a segment whose length runs past the file', () => {
		const broken = Buffer.concat([
			SOI,
			Buffer.from([0xff, 0xe1, 0xff, 0xff]),
			Buffer.from('short'),
		]);
		expect(() => stripImageMetadata(broken, 'jpg')).toThrow('bad segment length');
	});
});

describe('stripImageMetadata — PNG', () => {
	it('drops eXIf and text chunks, keeps the image chunks', () => {
		const png = Buffer.concat([
			PNG_SIG,
			chunk('IHDR', 'header'),
			chunk('eXIf', 'GPS 37.5'),
			chunk('tEXt', 'Author\0Yahyo'),
			chunk('IDAT', 'pixels'),
			chunk('IEND', ''),
		]);
		const out = stripImageMetadata(png, 'png').toString('latin1');
		expect(out).not.toContain('GPS');
		expect(out).not.toContain('Yahyo');
		expect(out).toContain('IHDR');
		expect(out).toContain('IDAT');
		expect(out).toContain('IEND');
	});
});
