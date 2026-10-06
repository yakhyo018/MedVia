/**
 * Creates the one ADMIN account. Signup can never produce an ADMIN, so this is the
 * only door — and it needs shell access plus the database credentials in .env.
 *
 *   npm run seed:admin        reads ADMIN_EMAIL and ADMIN_PASSWORD from .env
 *
 * Idempotent: running it again changes nothing.
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import * as bcrypt from 'bcryptjs';
import MemberSchema from '../schemas/Member.model';
import { MemberAuthType, MemberType } from '../libs/enums/member.enum';
import { Language } from '../libs/enums/common.enum';

const MIN_ADMIN_PASSWORD = 12;

async function main(): Promise<void> {
	const email = process.env.ADMIN_EMAIL?.toLowerCase().trim();
	const password = process.env.ADMIN_PASSWORD;
	if (!email || !password) throw new Error('Set ADMIN_EMAIL and ADMIN_PASSWORD in .env first.');
	if (password.length < MIN_ADMIN_PASSWORD) {
		throw new Error(`ADMIN_PASSWORD must be at least ${MIN_ADMIN_PASSWORD} characters.`);
	}

	const uri =
		process.env.NODE_ENV === 'production' ? process.env.MONGO_PROD : process.env.MONGO_DEV;
	if (!uri) throw new Error('No MongoDB URI in .env.');

	await mongoose.connect(uri);
	const Member = mongoose.model('Member', MemberSchema);

	const existing = await Member.findOne({ memberEmail: email }).lean().exec();
	if (existing?.memberType === MemberType.ADMIN) {
		console.log(`Admin ${email} already exists — nothing to do.`);
	} else if (existing) {
		throw new Error(
			`${email} belongs to a ${existing.memberType} account. Use another ADMIN_EMAIL.`,
		);
	} else {
		await Member.create({
			memberType: MemberType.ADMIN,
			memberAuthType: MemberAuthType.EMAIL,
			memberEmail: email,
			memberPassword: await bcrypt.hash(password, 10),
			memberFullName: 'MedVia Admin',
			memberLang: Language.EN,
			memberTermsAt: new Date(),
		});
		console.log(`Admin ${email} created.`);
	}

	await mongoose.disconnect();
}

main().catch(async (err) => {
	console.error(`\n${err.message}\n`);
	await mongoose.disconnect();
	process.exit(1);
});
