/**
 * Brings photos made after the seed into the database without seeding again (ids, bookings and
 * reviews stay): a seed doctor without a `doctorImage` gets their portrait from
 * seed/photos/doctors, and a seed clinic with fewer photos than seed/photos/clinics now holds
 * gets the full, ordered set (its old copies are deleted). Run after `npm run photos:generate`.
 *
 *   npm run photos:attach
 *
 * The database follows NODE_ENV, as seed:admin does (MONGO_PROD in production, else MONGO_DEV).
 */
import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import mongoose from 'mongoose';
import { CLINICS } from './seed/seed-data';
import { models, ROOT } from './seed/accounts';

const PORTRAITS = path.join(__dirname, 'seed', 'photos', 'doctors');
const CLINIC_PHOTOS = path.join(__dirname, 'seed', 'photos', 'clinics');

async function main(): Promise<void> {
	const uri =
		process.env.NODE_ENV === 'production' ? process.env.MONGO_PROD : process.env.MONGO_DEV;
	if (!uri) throw new Error('No MONGO_PROD / MONGO_DEV in .env.');
	await mongoose.connect(uri);
	const m = models();
	let attached = 0;
	for (const clinic of CLINICS) {
		const files = fs
			.readdirSync(CLINIC_PHOTOS)
			.filter((file) => file.startsWith(`${clinic.slug}-`) && /\.(jpg|webp)$/.test(file))
			.sort((a, b) => Number(/-(\d+)\./.exec(a)?.[1]) - Number(/-(\d+)\./.exec(b)?.[1]));
		const record = await m.Clinic.findOne({ clinicName: clinic.name, clinicNameKo: clinic.nameKo });
		if (!record || (record.clinicImages?.length ?? 0) >= files.length) continue;
		fs.mkdirSync(path.join(ROOT, 'uploads', 'clinic'), { recursive: true });
		const images = files.map((file) => {
			const stored = `uploads/clinic/${randomUUID()}${path.extname(file)}`;
			fs.copyFileSync(path.join(CLINIC_PHOTOS, file), path.join(ROOT, stored));
			return stored;
		});
		await m.Clinic.updateOne({ _id: record._id }, { $set: { clinicImages: images } });
		for (const old of record.clinicImages ?? []) fs.rmSync(path.join(ROOT, old), { force: true });
		attached++;
		console.log(`${clinic.name}: ${files.length} photos`);
	}
	for (const clinic of CLINICS) {
		for (const [i, seedDoctor] of clinic.doctors.entries()) {
			const file = ['.webp', '.jpg']
				.map((ext) => path.join(PORTRAITS, `${clinic.slug}-${i + 1}${ext}`))
				.find((candidate) => fs.existsSync(candidate));
			if (!file) continue;
			const doctor = await m.Doctor.findOne({
				doctorName: seedDoctor.name,
				doctorNameKo: seedDoctor.nameKo,
				$or: [{ doctorImage: { $exists: false } }, { doctorImage: '' }, { doctorImage: null }],
			});
			if (!doctor) continue;
			const stored = `uploads/doctor/${randomUUID()}${path.extname(file)}`;
			fs.mkdirSync(path.join(ROOT, 'uploads', 'doctor'), { recursive: true });
			fs.copyFileSync(file, path.join(ROOT, stored));
			await m.Doctor.updateOne({ _id: doctor._id }, { $set: { doctorImage: stored } });
			attached++;
			console.log(`${seedDoctor.name} ← ${path.basename(file)}`);
		}
	}
	console.log(`${attached} clinics / doctors updated.`);
	await mongoose.disconnect();
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
