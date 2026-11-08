import {
	BadRequestException,
	ForbiddenException,
	Injectable,
	Logger,
	NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, ObjectId, Types } from 'mongoose';
import { OrdinaryInquiry } from '../../libs/dto/common/inquiry';
import { FaceScan, FaceScans } from '../../libs/dto/face-scan/face-scan';
import { Language, Messages } from '../../libs/enums/common.enum';
import { FaceScanStatus } from '../../libs/enums/face-scan.enum';
import { T } from '../../libs/types/common';
import { decrypt, encrypt, parseKey } from '../../libs/utils/crypto.util';
import { detectImageType, IMAGE_MEDIA_TYPE, stripImageMetadata } from '../../libs/utils/image.util';
import { RedisService } from '../../redis/redis.service';
import { AiService } from '../ai/ai.service';
import { seoulDateOf } from '../booking/booking.rules';
import {
	DAILY_FACE_SCANS,
	dailyFaceScansKey,
	FACE_SCAN_DISCLAIMER,
	specialtyFor,
} from './face-scan.rules';

/**
 * The face scan: photo in, reading out, photo gone. The photo is held in this request's memory
 * only — never written to disk, never logged, never cached — so there is nothing to encrypt,
 * expire or leak afterwards. Only the patient sees their scans; no clinic, no doctor, no admin.
 */
@Injectable()
export class FaceScanService {
	private readonly logger = new Logger(FaceScanService.name);
	private readonly key = parseKey(process.env.MEDICAL_ENC_KEY);

	constructor(
		@InjectModel('FaceScan') private readonly faceScanModel: Model<T>,
		@InjectModel('Member') private readonly memberModel: Model<T>,
		private readonly aiService: AiService,
		private readonly redisService: RedisService,
	) {}

	/**
	 * Order matters: the cheap checks first (consent, file type), then the daily counter, then
	 * the paid call. A PENDING row is written before the call, so a crash mid-call leaves a
	 * trace instead of nothing.
	 */
	public async scan(memberId: ObjectId, buffer: Buffer, now = new Date()): Promise<FaceScan> {
		const lang = await this.consentedLanguage(memberId);

		const type = detectImageType(buffer);
		if (!type) throw new BadRequestException(Messages.PROVIDE_ALLOWED_FORMAT);
		let clean: Buffer;
		try {
			clean = stripImageMetadata(buffer, type);
		} catch {
			throw new BadRequestException(Messages.PROVIDE_ALLOWED_FORMAT);
		}

		await this.countToday(memberId, now);

		const pending = await this.faceScanModel.create({
			memberId,
			faceScanLang: lang,
			aiProvider: this.aiService.providerName,
		});
		const analysis = await this.aiService.analyzeFace(
			{ data: clean, mediaType: IMAGE_MEDIA_TYPE[type] },
			lang,
		);

		const update = analysis
			? {
					faceScanStatus: FaceScanStatus.DONE,
					findings: analysis.findings,
					qualityIssues: analysis.qualityIssues,
					faceScanSummary: encrypt(analysis.summary, this.key),
					suggestedSpecialty: specialtyFor(analysis.findings),
				}
			: { faceScanStatus: FaceScanStatus.FAILED };
		const saved = await this.faceScanModel
			.findByIdAndUpdate(pending._id, { $set: update }, { new: true })
			.lean()
			.exec();
		return this.present(saved as T);
	}

	public async getMyScans(memberId: ObjectId, input: OrdinaryInquiry): Promise<FaceScans> {
		const { page, limit } = input;
		const [result] = await this.faceScanModel
			.aggregate([
				{ $match: { memberId, faceScanStatus: { $ne: FaceScanStatus.DELETE } } },
				{ $sort: { createdAt: -1, _id: -1 } },
				{
					$facet: {
						list: [{ $skip: (page - 1) * limit }, { $limit: limit }],
						metaCounter: [{ $count: 'total' }],
					},
				},
			])
			.exec();
		return { ...result, list: result.list.map((s: T) => this.present(s)) } as FaceScans;
	}

	/** The owner's own scan or 404 — another member's id answers exactly like a missing one. */
	public async getScan(memberId: ObjectId, scanId: string): Promise<FaceScan> {
		const scan = await this.faceScanModel
			.findOne({
				_id: this.toObjectId(scanId),
				memberId,
				faceScanStatus: { $ne: FaceScanStatus.DELETE },
			})
			.lean()
			.exec();
		if (!scan) throw new NotFoundException(Messages.NO_DATA_FOUND);
		return this.present(scan);
	}

	/**
	 * Soft delete, as everywhere in MedVia — but the reading itself goes: the row keeps only the
	 * fact that a scan happened (status, dates, provider), not what was seen on the face.
	 */
	public async deleteScan(memberId: ObjectId, scanId: string): Promise<FaceScan> {
		const scan = await this.faceScanModel
			.findOneAndUpdate(
				{
					_id: this.toObjectId(scanId),
					memberId,
					faceScanStatus: { $ne: FaceScanStatus.DELETE },
				},
				{
					$set: { faceScanStatus: FaceScanStatus.DELETE, deletedAt: new Date(), findings: [] },
					$unset: { faceScanSummary: 1, suggestedSpecialty: 1 },
				},
				{ new: true },
			)
			.lean()
			.exec();
		if (!scan) throw new NotFoundException(Messages.NO_DATA_FOUND);
		return this.present(scan);
	}

	/** A face photo is health data: it goes to a model only with the AI consent (AI-1). */
	private async consentedLanguage(memberId: ObjectId): Promise<Language> {
		const member = await this.memberModel
			.findById(memberId, { memberLang: 1, memberAiConsentAt: 1 })
			.lean()
			.exec();
		if (!member?.memberAiConsentAt) throw new ForbiddenException(Messages.AI_CONSENT_REQUIRED);
		return (member.memberLang as Language) ?? Language.EN;
	}

	/**
	 * INCR is atomic in Redis, so two parallel uploads cannot both read "4" and both pass.
	 * Redis down → the limit is skipped (fail open, like the assistant): the scan is a feature,
	 * not a security boundary.
	 */
	private async countToday(memberId: ObjectId, now: Date): Promise<void> {
		const key = dailyFaceScansKey(memberId, seoulDateOf(now));
		try {
			const used = await this.redisService.redis.incr(key);
			if (used === 1) await this.redisService.redis.expire(key, 2 * 24 * 60 * 60);
			if (used > DAILY_FACE_SCANS) throw new BadRequestException(Messages.FACE_SCAN_DAILY_LIMIT);
		} catch (err) {
			if (err instanceof BadRequestException) throw err;
			this.logger.warn(`face scan daily limit unavailable: ${(err as Error).message}`);
		}
	}

	private present(scan: T): FaceScan {
		let summary: string | undefined;
		if (scan.faceScanSummary) {
			try {
				summary = decrypt(scan.faceScanSummary, this.key);
			} catch {
				// A key rotation gone wrong must not take the whole list down.
				this.logger.warn(`face scan ${scan._id}: summary could not be decrypted`);
			}
		}
		// Field by field, not `...scan`: POST /face-scan is REST, and REST has no GraphQL
		// selection to drop memberId, __v or anything a later schema change adds.
		return {
			_id: scan._id,
			faceScanStatus: scan.faceScanStatus,
			findings: scan.findings ?? [],
			qualityIssues: scan.qualityIssues ?? [],
			faceScanSummary: summary,
			faceScanLang: scan.faceScanLang,
			suggestedSpecialty: scan.suggestedSpecialty,
			aiProvider: scan.aiProvider,
			disclaimer: FACE_SCAN_DISCLAIMER,
			createdAt: scan.createdAt,
		};
	}

	private toObjectId(id: string): ObjectId {
		if (!Types.ObjectId.isValid(id)) throw new NotFoundException(Messages.NO_DATA_FOUND);
		return new Types.ObjectId(id) as unknown as ObjectId;
	}
}
