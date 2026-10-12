/**
 * Removes what the Postman and socket runs leave behind: every account under @medvia.test
 * (exactly that domain — the demo seed's @seed.medvia.test stays) and everything it owns or
 * touched. Then recounts the counters those runs changed and clears the list caches.
 *
 *   npm run clean:test             shows what would go, changes nothing
 *   npm run clean:test -- --yes    removes it
 *
 * `npm run test:api` runs it with --yes when the run ends (KEEP_TEST_DATA=1 skips that).
 * Never in production.
 */
import 'reflect-metadata';
import 'dotenv/config';
import mongoose from 'mongoose';
import { models, planAccountRemoval } from './seed/accounts';
import { CacheKeys } from '../libs/config';
import { BatchCacheService } from '../../../medvia-batch/src/batch-cache.service';
import { RecountService } from '../../../medvia-batch/src/jobs/recount.service';
import { RankService } from '../../../medvia-batch/src/jobs/rank.service';

const TEST_DOMAIN = '@medvia.test';

async function main(): Promise<void> {
	if (process.env.NODE_ENV === 'production')
		throw new Error('clean:test never runs in production.');
	if (!process.env.MONGO_DEV) throw new Error('No MONGO_DEV in .env.');
	const apply = process.argv.includes('--yes');

	await mongoose.connect(process.env.MONGO_DEV);
	const m = models();
	const plan = await planAccountRemoval(m, TEST_DOMAIN);

	const rows = Object.entries(plan.counts).filter(([, n]) => n > 0);
	if (!rows.length) {
		console.log(`No ${TEST_DOMAIN} test data.`);
		return;
	}
	console.log(`${apply ? 'Removing' : 'Would remove'} the ${TEST_DOMAIN} test data:`);
	for (const [name, n] of rows) console.log(`  ${name.padEnd(18)} ${n}`);
	if (!apply) {
		console.log('\nNothing changed. Run with -- --yes to remove it.');
		return;
	}

	await plan.run();

	// Likes, follows and reviews of test accounts may have touched seeded clinics and doctors.
	const cache = new BatchCacheService();
	const recount = await new RecountService(
		m.Clinic,
		m.Doctor,
		m.Follow,
		m.Treatment,
		m.Review,
		cache,
	).run();
	const rank = await new RankService(m.Clinic, m.Doctor, m.Booking, cache).run();
	await cache.unlink([CacheKeys.activeClinicIds]);
	await cache.unlinkPattern('clinic:*');
	await cache.unlinkPattern('doctor:*');
	await cache.onModuleDestroy();
	console.log(`Done. RECOUNT — ${recount}\nRANK — ${rank}`);
}

main()
	.catch((err) => {
		console.error(`\n${err.message}\n`);
		process.exitCode = 1;
	})
	.finally(() => mongoose.disconnect());
