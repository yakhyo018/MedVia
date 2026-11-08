import {
	BadRequestException,
	Injectable,
	Logger,
	ServiceUnavailableException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, ObjectId, Types } from 'mongoose';
import { NaviAnswer } from '../../libs/dto/navi/navi';
import { Messages } from '../../libs/enums/common.enum';
import { T } from '../../libs/types/common';
import { RedisService } from '../../redis/redis.service';
import {
	NAVI_DISCLAIMER,
	NAVI_PER_MINUTE,
	NAVI_TIMEOUT_MS,
	naviRateKey,
	parseDocId,
	sourceUrl,
} from './navi.rules';

/** Navi's `POST /v1/query` answer — only the fields MedVia passes on. */
interface NaviQueryResponse {
	answer: string;
	refused: boolean;
	sources: { index: number; doc_id: string; title: string; heading: string; cited: boolean }[];
}

/**
 * The door to Navi, MedVia's RAG service (a separate Python app). The API key stays here, on the
 * server: the browser asks MedVia, never Navi. Navi down, slow or misconfigured → one message,
 * "not available"; nothing else in MedVia depends on it.
 */
@Injectable()
export class NaviService {
	private readonly logger = new Logger(NaviService.name);
	private readonly url = (process.env.NAVI_URL ?? '').replace(/\/+$/, '');
	private readonly apiKey = process.env.NAVI_API_KEY ?? '';

	constructor(
		@InjectModel('Treatment') private readonly treatmentModel: Model<T>,
		private readonly redisService: RedisService,
	) {}

	public async ask(memberId: ObjectId, question: string, now = new Date()): Promise<NaviAnswer> {
		if (!this.url || !this.apiKey) throw new ServiceUnavailableException(Messages.NAVI_UNAVAILABLE);
		await this.countMinute(memberId, now);

		const reply = await this.query(question.trim());
		const treatmentClinic = await this.treatmentClinics(reply.sources.map((s) => s.doc_id));
		return {
			answer: reply.answer,
			refused: reply.refused,
			sources: reply.sources.map((s) => ({
				index: s.index,
				docId: s.doc_id,
				title: s.title,
				heading: s.heading,
				cited: s.cited,
				url: sourceUrl(s.doc_id, treatmentClinic),
			})),
			disclaimer: NAVI_DISCLAIMER,
		};
	}

	private async query(question: string): Promise<NaviQueryResponse> {
		let response: Response;
		try {
			response = await fetch(`${this.url}/v1/query`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', 'X-API-Key': this.apiKey },
				body: JSON.stringify({ question }),
				signal: AbortSignal.timeout(NAVI_TIMEOUT_MS),
			});
		} catch (err) {
			this.logger.warn(`navi unreachable: ${(err as Error).message}`);
			throw new ServiceUnavailableException(Messages.NAVI_UNAVAILABLE);
		}
		if (!response.ok) {
			// 401 = the two keys differ; 422 = Navi's own validation; 5xx = Navi broke. The patient
			// sees one message either way; the log says which.
			this.logger.warn(`navi answered ${response.status}`);
			throw new ServiceUnavailableException(Messages.NAVI_UNAVAILABLE);
		}
		return (await response.json()) as NaviQueryResponse;
	}

	/** A treatment's page is its clinic's page: one query for every treatment among the sources. */
	private async treatmentClinics(docIds: string[]): Promise<Map<string, string>> {
		const ids = docIds
			.map(parseDocId)
			.filter((d) => d.kind === 'treatment' && Types.ObjectId.isValid(d.id))
			.map((d) => new Types.ObjectId(d.id));
		if (!ids.length) return new Map();
		const rows = await this.treatmentModel
			.find({ _id: { $in: ids } }, { clinicId: 1 })
			.lean()
			.exec();
		return new Map(rows.map((row: T) => [String(row._id), String(row.clinicId)]));
	}

	/**
	 * INCR is atomic, so ten parallel questions cannot all read "9". Redis down → no limit (fail
	 * open, like the assistant and the face scan): Navi is a feature, not a security boundary.
	 */
	private async countMinute(memberId: ObjectId, now: Date): Promise<void> {
		const key = naviRateKey(memberId, now);
		try {
			const used = await this.redisService.redis.incr(key);
			if (used === 1) await this.redisService.redis.expire(key, 120);
			if (used > NAVI_PER_MINUTE) throw new BadRequestException(Messages.NAVI_RATE_LIMIT);
		} catch (err) {
			if (err instanceof BadRequestException) throw err;
			this.logger.warn(`navi rate limit unavailable: ${(err as Error).message}`);
		}
	}
}
