import { BadRequestException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'crypto';
import * as bcrypt from 'bcryptjs';
import { RedisService } from '../../redis/redis.service';
import { AuthMember, T } from '../../libs/types/common';
import { Messages } from '../../libs/enums/common.enum';
import { MemberType } from '../../libs/enums/member.enum';
import { shapeIntoMongoObjectId } from '../../libs/config';
import { ACCESS_TOKEN_TTL_SECONDS } from './auth.constants';

const BCRYPT_ROUNDS = 10;

const jtiKey = (jti: string) => `auth:jti:${jti}`;
const cutoffKey = (memberId: string) => `auth:revoked:${memberId}`;
const nowSeconds = () => Math.floor(Date.now() / 1000);

@Injectable()
export class AuthService {
	private readonly logger = new Logger(AuthService.name);

	/**
	 * Compared against when the email is unknown, so a wrong email costs the same
	 * bcrypt time as a wrong password and response timing cannot reveal which accounts exist.
	 */
	private readonly dummyHash = bcrypt.hashSync('timing-equaliser', BCRYPT_ROUNDS);

	constructor(
		private readonly jwtService: JwtService,
		private readonly redisService: RedisService,
	) {}

	/* ───────────────────────── passwords ───────────────────────── */

	public async hashPassword(password: string): Promise<string> {
		return await bcrypt.hash(password, BCRYPT_ROUNDS);
	}

	/** Always runs bcrypt, even when there is no stored hash to compare with. */
	public async comparePassword(password: string, hash?: string | null): Promise<boolean> {
		const match = await bcrypt.compare(password, hash || this.dummyHash);
		return !!hash && match;
	}

	/* ───────────────────────── access tokens ───────────────────────── */

	/**
	 * Only the id and the role travel in the token: a JWT is signed, not encrypted.
	 * iatMs is the issue time in milliseconds. The standard iat claim has whole seconds,
	 * too coarse for revocation: a token issued earlier in the same second as a block
	 * would otherwise survive it.
	 */
	public async createAccessToken(member: { _id: any; memberType: MemberType }): Promise<string> {
		return await this.jwtService.signAsync(
			{ sub: String(member._id), memberType: member.memberType, iatMs: Date.now() },
			{ jwtid: randomUUID(), expiresIn: ACCESS_TOKEN_TTL_SECONDS },
		);
	}

	/** Reads the bearer token, checks signature, expiry and revocation. Throws otherwise. */
	public async authenticate(request: T): Promise<AuthMember> {
		const header: string | undefined = request.headers?.authorization;
		if (!header) throw new BadRequestException(Messages.TOKEN_NOT_EXIST);

		const [scheme, token] = header.split(' ');
		if (scheme !== 'Bearer' || !token) throw new UnauthorizedException(Messages.NOT_AUTHENTICATED);

		let payload: T;
		try {
			payload = await this.jwtService.verifyAsync(token);
		} catch {
			throw new UnauthorizedException(Messages.NOT_AUTHENTICATED);
		}

		if (await this.isRevoked(payload)) throw new UnauthorizedException(Messages.NOT_AUTHENTICATED);

		return {
			_id: shapeIntoMongoObjectId(payload.sub),
			memberType: payload.memberType,
			jti: payload.jti,
			iat: payload.iat,
			exp: payload.exp,
		};
	}

	/* ───────────────────────── revocation (Redis) ───────────────────────── */

	/** Logout on this device: this one token dies; its key expires with the token. */
	public async revokeAccessToken(jti: string, exp: number): Promise<void> {
		const ttl = exp - nowSeconds();
		if (ttl <= 0) return;
		try {
			await this.redisService.redis.set(jtiKey(jti), '1', 'EX', ttl);
		} catch (err: any) {
			this.logger.warn(`could not revoke token ${jti}: ${err.message}`);
		}
	}

	/**
	 * Block, password change, stolen session: every access token issued before now dies.
	 * One key per member instead of one per token, because we never knew the token ids.
	 * It may expire after one access-token lifetime: by then every older token has expired anyway.
	 */
	public async revokeAllAccessTokens(memberId: any): Promise<void> {
		try {
			await this.redisService.redis.set(
				cutoffKey(String(memberId)),
				String(Date.now()),
				'EX',
				ACCESS_TOKEN_TTL_SECONDS,
			);
		} catch (err: any) {
			this.logger.warn(`could not revoke tokens of ${memberId}: ${err.message}`);
		}
	}

	/**
	 * Fails open: if Redis is down the request continues and the outage is logged.
	 * The short access-token lifetime stays as the backstop.
	 */
	private async isRevoked(payload: T): Promise<boolean> {
		try {
			const [revokedJti, cutoff] = await this.redisService.redis.mget(
				jtiKey(payload.jti),
				cutoffKey(payload.sub),
			);
			if (revokedJti) return true;
			const issuedMs = payload.iatMs ?? payload.iat * 1000;
			return cutoff !== null && issuedMs < Number(cutoff);
		} catch (err: any) {
			this.logger.warn(`revocation check skipped, Redis unavailable: ${err.message}`);
			return false;
		}
	}
}
