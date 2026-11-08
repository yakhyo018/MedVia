import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
	BoardArticleCategory,
	BoardArticleStatus,
} from '../../../medvia-api/src/libs/enums/board-article.enum';
import { ClinicStatus } from '../../../medvia-api/src/libs/enums/clinic.enum';
import { DoctorStatus } from '../../../medvia-api/src/libs/enums/doctor.enum';
import { MemberType } from '../../../medvia-api/src/libs/enums/member.enum';
import { NoticeCategory, NoticeStatus } from '../../../medvia-api/src/libs/enums/notice.enum';
import { TreatmentStatus } from '../../../medvia-api/src/libs/enums/treatment.enum';
import { T } from '../../../medvia-api/src/libs/types/common';
import { authorName } from '../../../medvia-api/src/components/board-article/community.rules';
import {
	chunk,
	clinicDocument,
	docIds,
	hasContent,
	NAVI_BATCH_SIZE,
	NaviDocument,
	noticeDocument,
	staleIds,
	tipDocument,
	treatmentDocument,
} from './navi.rules';

/** Embedding 200 new documents on a laptop CPU takes a while; a lookup of unchanged ones does not. */
const POST_TIMEOUT_MS = 120_000;
const DELETE_TIMEOUT_MS = 15_000;

interface Counts {
	indexed: number;
	unchanged: number;
	deleted: number;
	absent: number;
}

/**
 * Keeps Navi's index equal to MedVia's public content: every night (and `npm run navi:sync`)
 * the live clinics, treatments, health tips, FAQ and notices go to `POST /v1/documents`, and
 * whatever is no longer live goes to `DELETE /v1/documents/{id}`. Navi skips unchanged
 * documents by hash, so sending everything is cheap; only new or edited ones are embedded.
 *
 * Reads MongoDB directly (like RECOUNT and RANK) with the API's own filters and sort orders —
 * the same rows a visitor sees on the site, without going through the API's HTTP layer.
 */
@Injectable()
export class NaviSyncService {
	private readonly logger = new Logger(NaviSyncService.name);

	constructor(
		@InjectModel('Clinic') private readonly clinicModel: Model<T>,
		@InjectModel('Doctor') private readonly doctorModel: Model<T>,
		@InjectModel('Treatment') private readonly treatmentModel: Model<T>,
		@InjectModel('BoardArticle') private readonly articleModel: Model<T>,
		@InjectModel('Notice') private readonly noticeModel: Model<T>,
		@InjectModel('Member') private readonly memberModel: Model<T>,
	) {}

	private get url(): string {
		return (process.env.NAVI_URL ?? '').replace(/\/+$/, '');
	}

	private get apiKey(): string {
		return process.env.NAVI_API_KEY ?? '';
	}

	/**
	 * Not configured → skipped, a normal result. Navi unreachable or refusing → the error
	 * propagates to BatchLogService, which records FAILED and lets the next night try again.
	 */
	public async run(): Promise<string> {
		if (!this.url || !this.apiKey) {
			this.logger.warn('NAVI_URL or NAVI_API_KEY is empty; Navi sync skipped');
			return 'skipped: Navi is not configured';
		}

		const { docs, candidates } = await this.collect();
		const counts: Counts = { indexed: 0, unchanged: 0, deleted: 0, absent: 0 };

		for (const part of chunk(docs, NAVI_BATCH_SIZE)) {
			for (const item of await this.ingest(part)) {
				if (item.status === 'indexed') counts.indexed++;
				else counts.unchanged++;
			}
		}

		const live = new Set(docs.map((d) => d.doc_id));
		for (const id of staleIds(candidates, live)) {
			if (await this.remove(id)) counts.deleted++;
			else counts.absent++;
		}

		const bySource = new Map<string, number>();
		for (const d of docs) bySource.set(d.source_type, (bySource.get(d.source_type) ?? 0) + 1);
		const sources = [...bySource].map(([type, n]) => `${type} ${n}`).join(', ');
		return (
			`${docs.length} documents (${sources}): indexed ${counts.indexed}, unchanged ` +
			`${counts.unchanged}, deleted ${counts.deleted} (not in Navi ${counts.absent})`
		);
	}

	/** The live documents, and every MedVia doc id that may once have been sent. */
	public async collect(): Promise<{ docs: NaviDocument[]; candidates: string[] }> {
		const docs: NaviDocument[] = [];
		const candidates: string[] = [];

		const clinics = await this.clinicModel.find({}).lean().exec();
		const activeClinics = new Map<string, T>();
		for (const c of clinics) {
			candidates.push(docIds.clinic(c._id));
			if (c.clinicStatus === ClinicStatus.ACTIVE) activeClinics.set(String(c._id), c);
		}

		// Same orders as the API: getDoctors (newest first), getClinicTreatments (cheapest first,
		// its doctors oldest first). The order is part of the text, so part of the hash.
		const [doctors, treatments, allTreatments] = await Promise.all([
			this.doctorModel
				.find({ doctorStatus: DoctorStatus.ACTIVE, clinicId: { $in: [...activeClinics.keys()] } })
				.sort({ createdAt: -1, _id: -1 })
				.lean()
				.exec(),
			this.treatmentModel
				.aggregate([
					{ $match: { treatmentStatus: TreatmentStatus.ACTIVE } },
					{ $sort: { treatmentPrice: 1, _id: 1 } },
					{
						$lookup: {
							from: 'doctors',
							localField: 'doctorIds',
							foreignField: '_id',
							pipeline: [
								{ $match: { doctorStatus: DoctorStatus.ACTIVE } },
								{ $sort: { createdAt: 1 } },
								{ $project: { doctorName: 1 } },
							],
							as: 'doctors',
						},
					},
				])
				.exec(),
			this.treatmentModel.find({}, { _id: 1 }).lean().exec(),
		]);
		for (const t of allTreatments) candidates.push(docIds.treatment(t._id));

		const group = (rows: T[]) => {
			const by = new Map<string, T[]>();
			for (const row of rows) {
				const key = String(row.clinicId);
				if (!by.has(key)) by.set(key, []);
				by.get(key)!.push(row);
			}
			return by;
		};
		const doctorsOf = group(doctors);
		const treatmentsOf = group(treatments);

		for (const [id, clinic] of activeClinics) {
			const own = treatmentsOf.get(id) ?? [];
			docs.push(clinicDocument(clinic, doctorsOf.get(id) ?? [], own));
			for (const t of own) docs.push(treatmentDocument(clinic, t));
		}

		docs.push(...(await this.tips(candidates)));
		docs.push(...(await this.notices(candidates)));
		return { docs, candidates };
	}

	private async tips(candidates: string[]): Promise<NaviDocument[]> {
		const articles = await this.articleModel
			.find(
				{ articleCategory: BoardArticleCategory.HEALTH_TIP },
				{ articleReports: 0, articleImages: 0 },
			)
			.sort({ createdAt: -1, _id: -1 })
			.lean()
			.exec();
		for (const a of articles) candidates.push(docIds.tip(a._id));

		const live = articles.filter(
			(a) => a.articleStatus === BoardArticleStatus.ACTIVE && hasContent(a.articleContent),
		);
		const authors = await this.memberModel
			.find({ _id: { $in: live.map((a) => a.memberId) } }, { memberFullName: 1, memberType: 1 })
			.lean()
			.exec();
		const byId = new Map(authors.map((m: T) => [String(m._id), m]));
		return live.map((a) => {
			const m = byId.get(String(a.memberId));
			return tipDocument(
				a,
				authorName(m?.memberFullName ?? '', (m?.memberType as MemberType) ?? MemberType.USER),
			);
		});
	}

	private async notices(candidates: string[]): Promise<NaviDocument[]> {
		const notices = await this.noticeModel
			.find({}, { noticeTranslations: 0 })
			.sort({ noticePinned: -1, publishedAt: -1, _id: -1 })
			.lean()
			.exec();
		const docs: NaviDocument[] = [];
		for (const n of notices) {
			// A notice moved from FAQ to NOTICE (or back) changes its id; the old one must go.
			candidates.push(docIds.notice(NoticeCategory.FAQ, n._id));
			candidates.push(docIds.notice(NoticeCategory.NOTICE, n._id));
			if (n.noticeStatus === NoticeStatus.ACTIVE && hasContent(n.noticeContent)) {
				docs.push(noticeDocument(n));
			}
		}
		return docs;
	}

	private async ingest(documents: NaviDocument[]): Promise<{ doc_id: string; status: string }[]> {
		const response = await this.call('POST', '/v1/documents', POST_TIMEOUT_MS, { documents });
		if (!response.ok) {
			throw new Error(
				`Navi POST /v1/documents answered ${response.status}: ${await this.reason(response)}`,
			);
		}
		const body = (await response.json()) as { items: { doc_id: string; status: string }[] };
		return body.items;
	}

	/** true = removed; false = Navi never had it (404). Anything else is an error. */
	private async remove(docId: string): Promise<boolean> {
		const path = `/v1/documents/${encodeURIComponent(docId)}`;
		const response = await this.call('DELETE', path, DELETE_TIMEOUT_MS);
		if (response.status === 404) return false;
		if (!response.ok) {
			throw new Error(
				`Navi DELETE ${docId} answered ${response.status}: ${await this.reason(response)}`,
			);
		}
		return true;
	}

	private async call(method: string, path: string, timeoutMs: number, body?: unknown) {
		try {
			return await fetch(`${this.url}${path}`, {
				method,
				headers: { 'Content-Type': 'application/json', 'X-API-Key': this.apiKey },
				body: body === undefined ? undefined : JSON.stringify(body),
				signal: AbortSignal.timeout(timeoutMs),
			});
		} catch (err) {
			throw new Error(`Navi unreachable at ${this.url}: ${(err as Error).message}`);
		}
	}

	private async reason(response: Response): Promise<string> {
		return (await response.text().catch(() => '')).slice(0, 300);
	}
}
