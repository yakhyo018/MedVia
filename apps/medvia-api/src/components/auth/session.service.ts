import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, ObjectId } from 'mongoose';
import { createHash, randomBytes } from 'crypto';
import { Messages } from '../../libs/enums/common.enum';
import { T } from '../../libs/types/common';
import { REFRESH_REUSE_GRACE_SECONDS, REFRESH_TOKEN_TTL_DAYS } from './auth.constants';
import { TokenService } from './token.service';

/**
 * SHA-256, not bcrypt: bcrypt is slow on purpose because passwords are short and
 * guessable. A 32-byte random token cannot be guessed, so a fast hash is enough.
 */
const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');
const newToken = () => randomBytes(32).toString('base64url');
const expiresAt = () => new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);

export interface RotatedSession {
	memberId: ObjectId;
	token: string;
}

@Injectable()
export class SessionService {
	private readonly logger = new Logger(SessionService.name);

	constructor(
		@InjectModel('Session') private readonly sessionModel: Model<T>,
		private readonly tokenService: TokenService,
	) {}

	/** Starts a session for one device and returns the raw refresh token, shown once. */
	public async issue(memberId: ObjectId, userAgent = ''): Promise<string> {
		const token = newToken();
		await this.sessionModel.create({
			memberId,
			sessionTokenHash: hashToken(token),
			sessionUserAgent: userAgent.slice(0, 300),
			sessionExpiresAt: expiresAt(),
			sessionLastUsedAt: new Date(),
		});
		return token;
	}

	/**
	 * Swaps a refresh token for a new one. The match and the swap are one atomic
	 * findOneAndUpdate, so two requests presenting the same token cannot both win.
	 */
	public async rotate(token: string): Promise<RotatedSession> {
		const hash = hashToken(token);
		const next = newToken();
		const now = new Date();

		const session = await this.sessionModel
			.findOneAndUpdate(
				{ sessionTokenHash: hash, sessionExpiresAt: { $gt: now } },
				{
					$set: {
						sessionTokenHash: hashToken(next),
						sessionPrevHash: hash,
						sessionExpiresAt: expiresAt(),
						sessionLastUsedAt: now,
					},
				},
				{ new: true },
			)
			.lean()
			.exec();

		if (session) return { memberId: session.memberId, token: next };

		await this.handleReplay(hash, now);
		throw new UnauthorizedException(Messages.SESSION_EXPIRED);
	}

	/**
	 * The token is not current. If it is the one this session just rotated away from,
	 * someone replayed it: within the grace window that is two tabs racing, later it
	 * means the token was copied. Then the session ends — so the copy dies — and so do
	 * the member's access tokens, because whoever holds the copy may also hold one.
	 */
	private async handleReplay(hash: string, now: Date): Promise<void> {
		const replayed = await this.sessionModel.findOne({ sessionPrevHash: hash }).lean().exec();
		if (!replayed) return;

		const rotatedAgo = (now.getTime() - new Date(replayed.sessionLastUsedAt).getTime()) / 1000;
		if (rotatedAgo <= REFRESH_REUSE_GRACE_SECONDS) return;

		await this.sessionModel.deleteOne({ _id: replayed._id }).exec();
		await this.tokenService.revokeAllAccessTokens(replayed.memberId);
		this.logger.warn(`refresh token reuse detected, session ended for member ${replayed.memberId}`);
	}

	/** Logout on this device. */
	public async revoke(token: string): Promise<void> {
		await this.sessionModel.deleteOne({ sessionTokenHash: hashToken(token) }).exec();
	}

	/** Block or password change: end every session, optionally keeping the current device. */
	public async revokeAll(memberId: ObjectId, keepToken?: string | null): Promise<void> {
		const filter: T = { memberId };
		if (keepToken) filter.sessionTokenHash = { $ne: hashToken(keepToken) };
		await this.sessionModel.deleteMany(filter).exec();
	}
}
