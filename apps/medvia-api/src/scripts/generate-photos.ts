/**
 * The demo's photos, made once and committed (seed:demo and photos:attach only copy them):
 *   seed/photos/clinics/<slug>-1..4.jpg   entrance, reception, treatment room, consultation room
 *   seed/photos/doctors/<slug>-1..3.jpg   a studio portrait of each of the clinic's three doctors
 *
 *   npm run photos:generate                          only the missing files
 *   npm run photos:generate -- --only=doctors        (or clinics)
 *   npm run photos:generate -- --file=doctors/seoul-glow-1.jpg,clinics/seoul-glow-2.jpg   samples
 *   npm run photos:generate -- --force               every selected file again
 *
 * FLUX.1 Krea [dev] through Hugging Face Inference Providers (the fal-ai route), paid from the
 * account's credits with HF_TOKEN from .env — $0.025 per started megapixel, so every size stays
 * under 1 MP (sips makes the web copy smaller anyway). Generated people are
 * nobody real: no licence and no likeness questions for fictional doctors. Every file's prompt
 * goes to seed/photos/manifest.json and SOURCES.md. A seed per file keeps reruns reproducible;
 * the run stops at the first refused request (e.g. credits used up) and a second run continues.
 * fal returns ~0.6–0.9 MB JPEGs; on macOS `sips` shrinks them to web size (~80–150 KB) before
 * they are committed (elsewhere the full file is kept and a warning printed).
 */
import 'dotenv/config';
import { execFileSync } from 'child_process';
import { createHash } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { CLINICS, SeedClinic } from './seed/seed-data';

const MODEL = 'black-forest-labs/FLUX.1-Krea-dev';
const ENDPOINT = 'https://router.huggingface.co/fal-ai/fal-ai/flux/krea';
const PHOTOS = path.join(__dirname, 'seed', 'photos');
const MANIFEST = path.join(PHOTOS, 'manifest.json');

/** Each clinic's interior look, so eight clinics don't share one style. */
const LOOK: Record<string, string> = {
	'seoul-glow': 'white walls, soft blush-pink accents, rounded furniture, warm indirect light',
	'myeongdong-mintleaf': 'mint-green and white palette, light oak wood, small indoor plants',
	'dosan-petalline': 'warm beige stone and marble, brushed brass details, gallery-like calm',
	'cheongdam-willowgate': 'dark walnut wood panels, brass lamps, deep green velvet chairs',
	'seorae-maplewood': 'warm maple wood, family-friendly, large windows, soft daylight',
	'itaewon-compass': 'navy blue and white, clean modern lines, round mirrors',
	'namsan-health': 'bright clean hospital white with calm sky-blue accents, spacious',
	'jongno-lantern':
		'light ash wood with round paper-lantern ceiling lights, modern Korean hanok touches',
};

const ROOM: Record<string, string> = {
	DERMATOLOGY: 'a dermatology laser treatment room with a treatment bed and a medical laser device',
	PLASTIC_SURGERY:
		'an aesthetic procedure room with a reclining treatment chair, a large mirror and a surgical light',
	DENTAL: 'a dental treatment room with a modern dental chair, overhead light and a monitor',
	CHECK_UP: 'a health check-up ultrasound room with an examination bed and an ultrasound machine',
};

const SPECIALIST: Record<string, string> = {
	DERMATOLOGY: 'dermatologist',
	PLASTIC_SURGERY: 'plastic surgeon',
	DENTAL: 'dentist',
	CHECK_UP: 'internal medicine doctor',
};

// FLUX has no negative prompt: "no text, no logos" made it paint garbled signs. Plain surfaces,
// described positively, keep the rooms free of lettering.
const INTERIOR =
	'architectural interior photograph, wide angle, natural colours, realistic materials, ' +
	'an empty room, bare plain walls and clean unmarked surfaces';

/**
 * Traits that tell the 24 doctors apart: one prompt template made every man the same face, haircut
 * and tie. Women and men are counted separately, and each list has a different length, so no two
 * doctors share the whole set.
 */
const TRAITS = {
	maleHair: [
		'short neatly side-parted black hair',
		'very short cropped hair',
		'medium-length slightly wavy hair swept back',
		'short hair greying at the temples',
		'thick straight hair with a soft fringe',
		'short curly permed hair',
	],
	femaleHair: [
		'a chin-length bob',
		'long straight hair tied in a low ponytail',
		'shoulder-length wavy hair',
		'hair pulled back in a neat bun',
		'a short pixie cut',
	],
	face: [
		'a round face',
		'a slim oval face',
		'a broad square jaw',
		'high cheekbones',
		'a soft full face',
	],
	glasses: ['', ', wearing thin gold-rimmed glasses', '', ', wearing black rectangular glasses'],
	maleUnder: [
		'a light blue shirt and a navy tie',
		'navy surgical scrubs',
		'a white shirt with an open collar',
		'a grey knit sweater',
		'a striped shirt and a burgundy tie',
	],
	femaleUnder: [
		'a cream blouse',
		'teal surgical scrubs',
		'a navy round-neck top',
		'a light pink knit top',
	],
	background: [
		'a plain light grey studio background',
		'a soft warm beige studio background',
		'a pale blue-grey studio background',
		'a softly blurred bright clinic corridor behind',
	],
	expression: ['a warm open smile', 'a calm closed-mouth smile', 'a gentle confident look'],
	pose: ['facing the camera', 'turned slightly to the left', 'turned slightly to the right'],
};
const pick = (list: string[], n: number): string => list[n % list.length];

interface Job {
	file: string;
	prompt: string;
	width: number;
	height: number;
	/** The longer side after `sips`, in pixels. */
	maxSide: number;
}

const clinicJobs = (clinic: SeedClinic): Job[] => {
	const look = LOOK[clinic.slug];
	const scenes = [
		`the view from a bright office corridor through open frameless clear glass doors into a small modern clinic lobby, ${look}`,
		`a reception desk and a waiting lounge with armchairs and a large potted plant in front of a bare plain wall, ${look}`,
		`${ROOM[clinic.specialty]}, ${look}`,
		`a quiet doctor consultation room with a desk, a computer and two chairs, ${look}`,
	];
	return scenes.map((scene, i) => ({
		file: `clinics/${clinic.slug}-${i + 1}.jpg`,
		prompt: `${scene}, ${INTERIOR}`,
		width: 1152,
		height: 864,
		maxSide: 1200,
	}));
};

/** Every seed doctor in order, with their place among the women or the men (for TRAITS). */
const DOCTORS = (() => {
	const count = { female: 0, male: 0 };
	return CLINICS.flatMap((clinic) =>
		clinic.doctors.map((doctor, i) => ({
			clinic,
			doctor,
			slot: i + 1,
			n: doctor.female ? count.female++ : count.male++,
		})),
	);
})();

const doctorJobs = (clinic: SeedClinic): Job[] =>
	DOCTORS.filter((d) => d.clinic === clinic).map(({ doctor, slot, n }) => {
		const hair = doctor.female ? pick(TRAITS.femaleHair, n) : pick(TRAITS.maleHair, n);
		const under = doctor.female ? pick(TRAITS.femaleUnder, n) : pick(TRAITS.maleUnder, n);
		return {
			file: `doctors/${clinic.slug}-${slot}.jpg`,
			prompt:
				`Professional headshot photograph of a ${30 + doctor.experience}-year-old Korean ` +
				`${doctor.female ? 'woman' : 'man'}, a ${SPECIALIST[clinic.specialty]}, with ${hair} and ` +
				`${pick(TRAITS.face, n + 2)}${pick(TRAITS.glasses, n + (doctor.female ? 1 : 0))}, ` +
				`white doctor coat over ${under}, ${pick(TRAITS.expression, n)}, ${pick(TRAITS.pose, n + 1)}, ` +
				`${pick(TRAITS.background, n + (doctor.female ? 2 : 0))}, soft natural light, head and shoulders, ` +
				'realistic skin texture, 85mm lens' +
				// Krea draws everyone in their twenties unless told otherwise.
				(doctor.experience >= 8 ? ', a mature face with natural fine lines around the eyes' : ''),
			width: 768,
			height: 960,
			maxSide: 800,
		};
	});

/** The same file always gets the same seeds: a rerun with --force reproduces it. */
const seedOf = (file: string, attempt: number): number =>
	createHash('sha256')
		.update(attempt ? `${file}#${attempt}` : file)
		.digest()
		.readUInt32BE(0);

/** fal's safety checker sometimes flags an empty room; the next seed usually passes. */
const ATTEMPTS = 3;

/** fal's text-to-image through the HF router: JSON in, `images[0].url` out (a URL or a data URI). */
async function generate(job: Job, token: string, attempt = 0): Promise<Buffer> {
	const res = await fetch(ENDPOINT, {
		method: 'POST',
		headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
		body: JSON.stringify({
			prompt: job.prompt,
			image_size: { width: job.width, height: job.height },
			seed: seedOf(job.file, attempt),
			output_format: 'jpeg',
			sync_mode: true,
		}),
	});
	if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
	const body = (await res.json()) as { images?: { url: string }[]; has_nsfw_concepts?: boolean[] };
	// The safety checker returns a black frame instead of refusing: another seed, then an error.
	if (body.has_nsfw_concepts?.[0]) {
		if (attempt + 1 < ATTEMPTS) return generate(job, token, attempt + 1);
		throw new Error(`Blocked by the safety checker ${ATTEMPTS} times (black images).`);
	}
	const url = body.images?.[0]?.url;
	if (!url) throw new Error(`No image: ${JSON.stringify(body).slice(0, 300)}`);
	if (url.startsWith('data:')) return Buffer.from(url.slice(url.indexOf(',') + 1), 'base64');
	const image = await fetch(url);
	if (!image.ok) throw new Error(`Image download: HTTP ${image.status}`);
	return Buffer.from(await image.arrayBuffer());
}

/** Web size: the longest side to `maxSide`, JPEG quality 80 (macOS `sips`). */
function shrink(target: string, maxSide: number): void {
	if (process.platform !== 'darwin') {
		console.warn(`  ${path.basename(target)} kept at full size (sips is macOS only)`);
		return;
	}
	execFileSync('sips', ['-Z', String(maxSide), '-s', 'formatOptions', '80', target], {
		stdio: 'ignore',
	});
}

function writeSources(manifest: Record<string, string>): void {
	const lines = [
		'# Seed photos — sources',
		'',
		`Generated with **${MODEL}** through Hugging Face Inference Providers (fal-ai) by`,
		'`npm run photos:generate`; the prompt of every file is below. The people shown are generated',
		'and are nobody real; the clinics and doctors of the demo are fictional (the footer says so).',
		'`c_*.jpg` / `t_*.jpg` are the old landing samples (MedVia-design), kept only as a fallback.',
		'',
		'| File | Prompt |',
		'| --- | --- |',
		...Object.keys(manifest)
			.sort()
			.map((file) => `| \`${file}\` | ${manifest[file].replace(/\|/g, '\\|')} |`),
		'',
	];
	fs.writeFileSync(path.join(PHOTOS, 'SOURCES.md'), lines.join('\n'));
}

async function main(): Promise<void> {
	const token = process.env.HF_TOKEN;
	if (!token) throw new Error('HF_TOKEN is missing in .env.');
	const arg = (name: string) =>
		process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
	const only = arg('only');
	const file = arg('file');
	const force = process.argv.includes('--force');
	const jobs = CLINICS.flatMap((clinic) => [
		...(only === 'doctors' ? [] : clinicJobs(clinic)),
		...(only === 'clinics' ? [] : doctorJobs(clinic)),
	]).filter((job) => !file || file.split(',').includes(job.file));
	if (file && !jobs.length) throw new Error(`No slot ${file}.`);
	const manifest: Record<string, string> = fs.existsSync(MANIFEST)
		? JSON.parse(fs.readFileSync(MANIFEST, 'utf8'))
		: {};
	let made = 0;
	for (const job of jobs) {
		const target = path.join(PHOTOS, job.file);
		if (!force && manifest[job.file] === job.prompt && fs.existsSync(target)) continue;
		fs.mkdirSync(path.dirname(target), { recursive: true });
		try {
			fs.writeFileSync(target, await generate(job, token));
			shrink(target, job.maxSide);
		} catch (err) {
			console.error(`Stopped at ${job.file}: ${(err as Error).message}`);
			break;
		}
		manifest[job.file] = job.prompt;
		made++;
		console.log(`${made}. ${job.file}`);
	}
	fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + '\n');
	writeSources(manifest);
	const missing = jobs.filter((job) => manifest[job.file] !== job.prompt).length;
	console.log(`${made} made, ${missing} still missing.`);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
