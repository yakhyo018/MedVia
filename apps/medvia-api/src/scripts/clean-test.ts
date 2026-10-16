/**
 * Removes what the Postman, socket and smoke runs leave behind:
 *   - every account under @medvia.test, @clinic.test or @test.com (the demo seed's
 *     @seed.medvia.test stays) and everything it owns or touched;
 *   - notices the tests created with a real admin account (their titles end with the run's
 *     random tag, e.g. "Chuseok holiday hours csmv28axuv");
 *   - audit-log rows whose target no longer exists;
 *   - batch logs, except the latest run of each batch (the admin dashboard shows that one).
 * Then recounts the counters those runs changed and clears the list caches.
 *
 *   npm run clean:test             shows what would go, changes nothing
 *   npm run clean:test -- --yes    removes it
 *
 * `npm run test:api` runs it with --yes when the run ends (KEEP_TEST_DATA=1 skips that).
 * Never in production.
 */
import 'reflect-metadata';
import 'dotenv/config';
import mongoose, { Types } from 'mongoose';
import { Models, models, planAccountRemoval, RemovalPlan } from './seed/accounts';
import { CacheKeys } from '../libs/config';
import { T } from '../libs/types/common';
import { BatchCacheService } from '../../../medvia-batch/src/batch-cache.service';
import { RecountService } from '../../../medvia-batch/src/jobs/recount.service';
import { RankService } from '../../../medvia-batch/src/jobs/rank.service';

const TEST_DOMAINS = ['@medvia.test', '@clinic.test', '@test.com'];
const SEED_DOMAIN = /@seed\.medvia\.test$/i;
/** The " {{token}}" the Postman folders append to what they create. */
const RUN_TAG = /\s[a-z0-9]{8,12}$/;

interface Sweep {
	name: string;
	count: number;
	run: () => Promise<unknown>;
}

/** Leftovers that belong to no test account: test notices, orphan audit rows, old batch logs. */
async function planSweeps(m: Models): Promise<Sweep[]> {
	const sweeps: Sweep[] = [];

	const realAdmins = (
		await m.Member.find({ memberType: 'ADMIN' }, { _id: 1, memberEmail: 1 }).lean()
	).filter((a) => !SEED_DOMAIN.test(a.memberEmail));
	const testNotices = (
		await m.Notice.find(
			{ memberId: { $in: realAdmins.map((a) => a._id) } },
			{ _id: 1, noticeTitle: 1 },
		).lean()
	).filter((n) => RUN_TAG.test(n.noticeTitle ?? ''));
	const noticeIds = testNotices.map((n) => n._id);
	sweeps.push({
		name: 'Notice (tests)',
		count: noticeIds.length,
		run: () => m.Notice.deleteMany({ _id: { $in: noticeIds } }),
	});

	const alive = new Set<string>();
	for (const name of [
		'Member',
		'Clinic',
		'Doctor',
		'Treatment',
		'Booking',
		'Review',
		'BoardArticle',
		'Comment',
	]) {
		for (const doc of await m[name].find({}, { _id: 1 }).lean()) alive.add(String(doc._id));
	}
	for (const doc of await m.Notice.find({ _id: { $nin: noticeIds } }, { _id: 1 }).lean())
		alive.add(String(doc._id));
	for (const doc of await m.Inquiry.find({}, { _id: 1 }).lean()) alive.add(String(doc._id));
	const orphanAudit = (await m.AuditLog.find({}, { _id: 1, auditRefId: 1 }).lean())
		.filter((row: T) => row.auditRefId && !alive.has(String(row.auditRefId)))
		.map((row) => row._id as Types.ObjectId);
	sweeps.push({
		name: 'AuditLog (orphan)',
		count: orphanAudit.length,
		run: () => m.AuditLog.deleteMany({ _id: { $in: orphanAudit } }),
	});

	const latest = await m.BatchLog.aggregate([
		{ $sort: { createdAt: -1 } },
		{ $group: { _id: '$batchName', keep: { $first: '$_id' } } },
	]);
	const keep = latest.map((row: T) => row.keep);
	const oldBatchLogs = await m.BatchLog.countDocuments({ _id: { $nin: keep } });
	sweeps.push({
		name: 'BatchLog (old)',
		count: oldBatchLogs,
		run: () => m.BatchLog.deleteMany({ _id: { $nin: keep } }),
	});

	return sweeps;
}

async function main(): Promise<void> {
	if (process.env.NODE_ENV === 'production')
		throw new Error('clean:test never runs in production.');
	if (!process.env.MONGO_DEV) throw new Error('No MONGO_DEV in .env.');
	const apply = process.argv.includes('--yes');

	await mongoose.connect(process.env.MONGO_DEV);
	const m = models();

	const plans: RemovalPlan[] = [];
	for (const domain of TEST_DOMAINS) plans.push(await planAccountRemoval(m, domain));
	const counts: Record<string, number> = {};
	for (const plan of plans) {
		for (const [name, n] of Object.entries(plan.counts)) counts[name] = (counts[name] ?? 0) + n;
	}

	// Accounts first, then the sweeps — so audit rows of what was just removed count as orphans.
	const rows = Object.entries(counts).filter(([, n]) => n > 0);
	if (rows.length) {
		console.log(
			`${apply ? 'Removing' : 'Would remove'} the test accounts (${TEST_DOMAINS.join(', ')}):`,
		);
		for (const [name, n] of rows) console.log(`  ${name.padEnd(18)} ${n}`);
	} else {
		console.log('No test accounts.');
	}
	if (apply) for (const plan of plans) await plan.run();

	const sweeps = (await planSweeps(m)).filter((s) => s.count > 0);
	if (sweeps.length) {
		console.log(`${apply ? 'Removing' : 'Would remove'} other test leftovers:`);
		for (const s of sweeps) console.log(`  ${s.name.padEnd(18)} ${s.count}`);
	}
	if (!apply) {
		if (rows.length || sweeps.length)
			console.log('\nNothing changed. Run with -- --yes to remove it.');
		return;
	}
	for (const s of sweeps) await s.run();
	if (!rows.length && !sweeps.length) return;

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
