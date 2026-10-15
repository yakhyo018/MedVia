/**
 * The demo's photos, made once and committed (seed:demo only copies them):
 *   seed/photos/clinics/<slug>-1..4.webp   entrance, reception, treatment room, consultation room
 *   seed/photos/doctors/<slug>-1..3.webp   a studio portrait of each of the clinic's three doctors
 *
 *   npm run photos:generate                  only the missing files
 *   npm run photos:generate -- --only=doctors
 *   npm run photos:generate -- --force       every file again
 *
 * FLUX.1-schnell (Apache 2.0) through its free Hugging Face Space (ZeroGPU, Gradio REST API),
 * with HF_TOKEN from .env — the account's daily free GPU quota, then the anonymous one; no
 * paid credits. Generated people are nobody real — no licence and no likeness questions, which is
 * why the fictional doctors are not stock photos of real people. Every file's prompt is written
 * to seed/photos/SOURCES.md. Stops at the first refused request (e.g. no credits); a second run
 * continues where it stopped.
 */
import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { CLINICS, SeedClinic } from './seed/seed-data';

const ENDPOINT = 'https://black-forest-labs-flux-1-schnell.hf.space/gradio_api/call/infer';
const MODEL = 'black-forest-labs/FLUX.1-schnell';
const PHOTOS = path.join(__dirname, 'seed', 'photos');
const MANIFEST = path.join(PHOTOS, 'manifest.json');

/** Each clinic's interior look, so eight clinics don't share one stock style. */
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
		'an aesthetic procedure room with a reclining treatment chair, a large mirror and a light',
	DENTAL: 'a dental treatment room with a modern dental chair, overhead light and a monitor',
	CHECK_UP: 'a health check-up ultrasound room with an examination bed and an ultrasound machine',
};

const SPECIALIST: Record<string, string> = {
	DERMATOLOGY: 'dermatologist',
	PLASTIC_SURGERY: 'plastic surgeon',
	DENTAL: 'dentist',
	CHECK_UP: 'internal medicine doctor',
};

const PHOTO =
	'photorealistic architectural interior photography, no people, no text, no letters, no logos';

interface Job {
	file: string;
	prompt: string;
	width: number;
	height: number;
}

const clinicJobs = (clinic: SeedClinic): Job[] => {
	const look = LOOK[clinic.slug];
	const scenes = [
		`the glass entrance of a small modern medical clinic inside a Seoul office building, ${look}`,
		// No word "clinic" and a blank wall: FLUX paints garbled signs behind a reception desk otherwise.
		`a reception desk and a waiting lounge with armchairs in front of a plain blank wall without any sign, ${look}`,
		`${ROOM[clinic.specialty]}, ${look}`,
		`a quiet doctor consultation room with a desk and two chairs, ${look}`,
	];
	return scenes.map((scene, i) => ({
		file: path.join('clinics', `${clinic.slug}-${i + 1}.webp`),
		prompt: `${scene}, ${PHOTO}`,
		width: 1024,
		height: 768,
	}));
};

const doctorJobs = (clinic: SeedClinic): Job[] =>
	clinic.doctors.map((doctor, i) => ({
		file: path.join('doctors', `${clinic.slug}-${i + 1}.webp`),
		prompt:
			`Professional studio headshot of a Korean ${doctor.female ? 'female' : 'male'} ${SPECIALIST[clinic.specialty]}, ` +
			`about ${28 + doctor.experience} years old, white doctor coat over a ${doctor.female ? 'blouse' : 'shirt and tie'}, ` +
			'plain light grey background, soft even light, natural friendly expression, looking at the camera, ' +
			'photorealistic, 85mm lens, head and shoulders, no text',
		width: 640,
		height: 800,
	}));

/** Gradio's REST API: POST starts a job, the GET stream ends with the result (the image file). */
async function generate(job: Job, token?: string): Promise<Buffer> {
	const auth: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
	const start = await fetch(ENDPOINT, {
		method: 'POST',
		headers: { ...auth, 'Content-Type': 'application/json' },
		// prompt, seed, randomize_seed, width, height, num_inference_steps
		body: JSON.stringify({ data: [job.prompt, 0, true, job.width, job.height, 4] }),
	});
	if (!start.ok) throw new Error(`HTTP ${start.status}: ${(await start.text()).slice(0, 200)}`);
	const { event_id: eventId } = (await start.json()) as { event_id: string };
	const stream = await (await fetch(`${ENDPOINT}/${eventId}`, { headers: auth })).text();
	const last = stream.trim().split('\n\n').pop() ?? '';
	const data = JSON.parse(
		last
			.split('\n')
			.find((line) => line.startsWith('data:'))
			?.slice(5) ?? 'null',
	);
	// "event: error" (quota used up, GPU busy) carries a message instead of the file.
	if (!last.startsWith('event: complete') || !Array.isArray(data)) {
		throw new Error(`${last.split('\n')[0]}: ${JSON.stringify(data).slice(0, 200)}`);
	}
	const image = await fetch(data[0].url, { headers: auth });
	if (!image.ok) throw new Error(`Image download: HTTP ${image.status}`);
	return Buffer.from(await image.arrayBuffer());
}

function writeSources(manifest: Record<string, string>): void {
	const lines = [
		'# Seed photos — sources',
		'',
		`Generated with **${MODEL}** (Apache 2.0) through its Hugging Face Space (ZeroGPU)`,
		'by `npm run photos:generate`. The people shown are generated and are nobody real; the clinics',
		'and doctors of the demo are fictional. Rows marked Unsplash are photos under the Unsplash License',
		'(free, commercial use allowed), chosen without people, signs or logos.',
		'',
		'| File | Source / prompt |',
		'| --- | --- |',
		...Object.keys(manifest)
			.sort()
			.map((file) => `| \`${file}\` | ${manifest[file].replace(/\|/g, '\\|')} |`),
		'',
	];
	fs.writeFileSync(path.join(PHOTOS, 'SOURCES.md'), lines.join('\n'));
}

/** A slot is filled by any image with the same name stem (.webp from FLUX, .jpg from stock). */
const exists = (file: string): boolean =>
	['.webp', '.jpg'].some((ext) => fs.existsSync(path.join(PHOTOS, file.replace(/\.\w+$/, ext))));

async function main(): Promise<void> {
	const token = process.env.HF_TOKEN;
	if (!token) throw new Error('HF_TOKEN is missing in .env.');
	const only = process.argv.find((arg) => arg.startsWith('--only='))?.split('=')[1];
	const force = process.argv.includes('--force');
	const jobs = CLINICS.flatMap((clinic) => [
		...(only === 'doctors' ? [] : clinicJobs(clinic)),
		...(only === 'clinics' ? [] : doctorJobs(clinic)),
	]);
	const manifest: Record<string, string> = fs.existsSync(MANIFEST)
		? JSON.parse(fs.readFileSync(MANIFEST, 'utf8'))
		: {};
	let made = 0;
	for (const job of jobs) {
		const target = path.join(PHOTOS, job.file);
		// A stock photo in another format ("<slug>-2.jpg") fills the slot as well.
		if (!force && exists(job.file)) continue;
		fs.mkdirSync(path.dirname(target), { recursive: true });
		try {
			// The account's daily GPU quota first; when it is used up, the Space's anonymous quota.
			const image = await generate(job, token).catch(() => generate(job));
			fs.writeFileSync(target, image);
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
	const missing = jobs.filter((job) => !exists(job.file)).length;
	console.log(`${made} made, ${missing} still missing.`);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
