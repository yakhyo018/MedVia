import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import type { Request, Response } from 'express';
import * as bcrypt from 'bcryptjs';
import { Member } from '../../libs/dto/member/member';
import { Messages } from '../../libs/enums/common.enum';
import { MemberStatus } from '../../libs/enums/member.enum';
import { AuthMember, T } from '../../libs/types/common';
import { TokenService } from './token.service';
import { SessionService } from './session.service';
import { clearRefreshCookie, readRefreshCookie, setRefreshCookie } from './refresh-cookie';

const BCRYPT_ROUNDS = 10;

/**
 * The one door other modules use for authentication: passwords, and the life of a
 * session — start, refresh, end here, end everywhere. Tokens, refresh sessions and
 * the cookie are details behind it; callers never touch them directly.
 */
@Injectable()
export class AuthService {
	/**
	 * Compared against when the email is unknown, so a wrong email costs the same
	 * bcrypt time as a wrong password and response timing cannot reveal which accounts exist.
	 */
	private readonly dummyHash = bcrypt.hashSync('timing-equaliser', BCRYPT_ROUNDS);

	constructor(
		@InjectModel('Member') private readonly memberModel: Model<Member>,
		private readonly tokenService: TokenService,
		private readonly sessionService: SessionService,
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

	/* ───────────────────────── session lifecycle ───────────────────────── */

	/** Signup and every login path: refresh token into the cookie, access token into the body. */
	public async startSession(member: T, req: Request, res: Response): Promise<Member> {
		const refreshToken = await this.sessionService.issue(member._id, req.headers['user-agent']);
		setRefreshCookie(res, refreshToken);
		return await this.withAccessToken(member);
	}

	/**
	 * The cookie is the credential: the access token may already be expired — that is
	 * why the client is refreshing. The member is re-read, so a role change or a block
	 * takes effect on the next refresh at the latest.
	 */
	public async refreshSession(req: Request, res: Response): Promise<Member> {
		const token = readRefreshCookie(req);
		if (!token) throw new UnauthorizedException(Messages.SESSION_EXPIRED);

		let rotated;
		try {
			rotated = await this.sessionService.rotate(token);
		} catch (err) {
			clearRefreshCookie(res);
			throw err;
		}

		const member = await this.memberModel.findById(rotated.memberId).lean().exec();
		if (!member || member.memberStatus !== MemberStatus.ACTIVE) {
			await this.endAllSessions(rotated.memberId);
			clearRefreshCookie(res);
			throw new UnauthorizedException(Messages.SESSION_EXPIRED);
		}

		setRefreshCookie(res, rotated.token);
		return await this.withAccessToken(member);
	}

	/** Logout: this device only — its refresh session and its current access token. */
	public async endSession(authMember: AuthMember, req: Request, res: Response): Promise<boolean> {
		const token = readRefreshCookie(req);
		if (token) await this.sessionService.revoke(token);
		await this.tokenService.revokeAccessToken(authMember.jti, authMember.exp);
		clearRefreshCookie(res);
		return true;
	}

	/**
	 * Block, delete, password change, account linking: every refresh session and every
	 * access token of the member dies now. Passing `keepCurrent` spares the session whose
	 * cookie is on that request — the device that changed the password stays signed in.
	 */
	public async endAllSessions(memberId: any, keepCurrent?: Request): Promise<void> {
		const keepToken = keepCurrent ? readRefreshCookie(keepCurrent) : null;
		await this.sessionService.revokeAll(memberId, keepToken);
		await this.tokenService.revokeAllAccessTokens(memberId);
	}

	/** The member as GraphQL returns it, plus a fresh access token. */
	public async withAccessToken(member: T): Promise<Member> {
		return {
			...member,
			accessToken: await this.tokenService.createAccessToken(member as Member),
		} as Member;
	}
}
