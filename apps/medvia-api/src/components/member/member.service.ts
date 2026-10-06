import {
	BadRequestException,
	ForbiddenException,
	Injectable,
	InternalServerErrorException,
	UnauthorizedException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, ObjectId } from 'mongoose';
import type { Request, Response } from 'express';
import { Member, Members } from '../../libs/dto/member/member';
import {
	ChangePasswordInput,
	GoogleLoginInput,
	LoginInput,
	MemberInput,
	MembersInquiry,
} from '../../libs/dto/member/member.input';
import { MemberAdminUpdate, MemberUpdate } from '../../libs/dto/member/member.update';
import { Direction, Language, Messages } from '../../libs/enums/common.enum';
import { MemberAuthType, MemberStatus, MemberType } from '../../libs/enums/member.enum';
import { AuthMember, T } from '../../libs/types/common';
import { escapeRegex, shapeIntoMongoObjectId } from '../../libs/config';
import { AuthService } from '../auth/auth.service';
import { SessionService } from '../auth/session.service';
import { GoogleService } from '../auth/google.service';
import { clearRefreshCookie, readRefreshCookie, setRefreshCookie } from '../auth/refresh-cookie';

const DUPLICATE_KEY = 11000;

@Injectable()
export class MemberService {
	constructor(
		@InjectModel('Member') private readonly memberModel: Model<Member>,
		private readonly authService: AuthService,
		private readonly sessionService: SessionService,
		private readonly googleService: GoogleService,
	) {}

	/* ───────────────────────── sign up / sign in ───────────────────────── */

	public async signup(input: MemberInput, req: Request, res: Response): Promise<Member> {
		// termsAccepted is pulled out so it is not stored; @Equals(true) already enforced it.
		const { termsAccepted, memberPassword, ...profile } = input;
		const now = new Date();

		let member: T;
		try {
			member = await this.memberModel.create({
				...profile,
				memberAuthType: MemberAuthType.EMAIL,
				memberPassword: await this.authService.hashPassword(memberPassword),
				memberTermsAt: now,
				memberLastLoginAt: now,
			});
		} catch (err: any) {
			if (err?.code === DUPLICATE_KEY) throw new BadRequestException(Messages.USED_EMAIL);
			throw new BadRequestException(Messages.CREATE_FAILED);
		}

		return await this.startSession(member.toObject(), req, res);
	}

	/**
	 * One message for "no such email" and "wrong password", and the same bcrypt cost for
	 * both, so neither the text nor the response time tells an attacker which emails exist.
	 * Status is checked only after the password: a blocked account is not revealed to a guesser.
	 */
	public async login(input: LoginInput, req: Request, res: Response): Promise<Member> {
		const member = await this.memberModel
			.findOne({ memberEmail: input.memberEmail.toLowerCase().trim() })
			.select('+memberPassword')
			.lean()
			.exec();

		const valid = await this.authService.comparePassword(
			input.memberPassword,
			member?.memberPassword,
		);
		if (!member || !valid || member.memberStatus === MemberStatus.DELETE) {
			throw new UnauthorizedException(Messages.WRONG_CREDENTIALS);
		}
		if (member.memberStatus === MemberStatus.BLOCK)
			throw new ForbiddenException(Messages.BLOCKED_USER);

		return await this.startSession(await this.touchLastLogin(member._id), req, res);
	}

	public async googleLogin(input: GoogleLoginInput, req: Request, res: Response): Promise<Member> {
		const google = await this.googleService.verify(input.idToken);

		let member: T | null = await this.memberModel
			.findOne({ memberGoogleId: google.googleId })
			.lean()
			.exec();
		if (!member) member = await this.linkOrCreateGoogleMember(google, input);

		if (member.memberStatus === MemberStatus.DELETE)
			throw new UnauthorizedException(Messages.WRONG_CREDENTIALS);
		if (member.memberStatus === MemberStatus.BLOCK)
			throw new ForbiddenException(Messages.BLOCKED_USER);

		return await this.startSession(await this.touchLastLogin(member._id), req, res);
	}

	/**
	 * Same email already registered with a password: MedVia never verified that address,
	 * Google has. So whoever set that password is unproven — it could be an attacker who
	 * registered the victim's email first and waits for them to arrive with Google.
	 * Linking therefore removes the password and ends every existing session.
	 */
	private async linkOrCreateGoogleMember(google: T, input: GoogleLoginInput): Promise<T> {
		const existing = await this.memberModel.findOne({ memberEmail: google.email }).lean().exec();

		if (existing) {
			if (!google.emailVerified) throw new UnauthorizedException(Messages.GOOGLE_TOKEN_INVALID);
			const linked = await this.memberModel
				.findByIdAndUpdate(
					existing._id,
					{ $set: { memberGoogleId: google.googleId }, $unset: { memberPassword: 1 } },
					{ new: true },
				)
				.lean()
				.exec();
			await this.sessionService.revokeAll(existing._id as any);
			await this.authService.revokeAllAccessTokens(existing._id);
			return linked as T;
		}

		if (input.termsAccepted !== true) throw new BadRequestException(Messages.TERMS_REQUIRED);

		const created = await this.memberModel.create({
			memberType: input.memberType ?? MemberType.USER,
			memberAuthType: MemberAuthType.GOOGLE,
			memberEmail: google.email,
			memberGoogleId: google.googleId,
			memberFullName: google.fullName,
			memberImage: google.image,
			memberLang: input.memberLang ?? Language.EN,
			memberTermsAt: new Date(),
		});
		return created.toObject();
	}

	/** New access token in the body, new refresh token in the httpOnly cookie. */
	private async startSession(member: T, req: Request, res: Response): Promise<Member> {
		const refreshToken = await this.sessionService.issue(member._id, req.headers['user-agent']);
		setRefreshCookie(res, refreshToken);
		return {
			...member,
			accessToken: await this.authService.createAccessToken(member as any),
		} as Member;
	}

	private async touchLastLogin(memberId: any): Promise<T> {
		return (await this.memberModel
			.findByIdAndUpdate(memberId, { memberLastLoginAt: new Date() }, { new: true })
			.lean()
			.exec()) as T;
	}

	/* ───────────────────────── session lifecycle ───────────────────────── */

	/**
	 * No AuthGuard here: the access token may already be expired — that is why the
	 * client is refreshing. The cookie is the credential. The member is re-read so a
	 * role change or a block takes effect on the next refresh at the latest.
	 */
	public async refreshToken(req: Request, res: Response): Promise<Member> {
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
			await this.sessionService.revokeAll(rotated.memberId);
			clearRefreshCookie(res);
			throw new UnauthorizedException(Messages.SESSION_EXPIRED);
		}

		setRefreshCookie(res, rotated.token);
		return { ...member, accessToken: await this.authService.createAccessToken(member) } as Member;
	}

	/** This device only: its refresh session and its current access token. */
	public async logout(authMember: AuthMember, req: Request, res: Response): Promise<boolean> {
		const token = readRefreshCookie(req);
		if (token) await this.sessionService.revoke(token);
		await this.authService.revokeAccessToken(authMember.jti, authMember.exp);
		clearRefreshCookie(res);
		return true;
	}

	/**
	 * Every other device is signed out; this one gets a fresh access token and keeps
	 * its refresh session. Also clears the "must change password" flag of doctor accounts.
	 */
	public async changePassword(
		authMember: AuthMember,
		input: ChangePasswordInput,
		req: Request,
	): Promise<Member> {
		const member = await this.memberModel
			.findById(authMember._id)
			.select('+memberPassword')
			.lean()
			.exec();
		if (!member || member.memberStatus !== MemberStatus.ACTIVE) {
			throw new UnauthorizedException(Messages.NOT_AUTHENTICATED);
		}

		// A Google-only account has no password yet and may set its first one.
		if (member.memberPassword) {
			const valid =
				!!input.currentPassword &&
				(await this.authService.comparePassword(input.currentPassword, member.memberPassword));
			if (!valid) throw new BadRequestException(Messages.WRONG_CURRENT_PASSWORD);
		}

		const updated = await this.memberModel
			.findByIdAndUpdate(
				member._id,
				{
					memberPassword: await this.authService.hashPassword(input.newPassword),
					memberMustChangePassword: false,
				},
				{ new: true },
			)
			.lean()
			.exec();

		await this.sessionService.revokeAll(member._id as any, readRefreshCookie(req));
		await this.authService.revokeAllAccessTokens(member._id);

		return {
			...updated,
			accessToken: await this.authService.createAccessToken(updated as any),
		} as Member;
	}

	/* ───────────────────────── own profile ───────────────────────── */

	public async getMyProfile(memberId: ObjectId): Promise<Member> {
		const member = await this.memberModel
			.findOne({ _id: memberId, memberStatus: MemberStatus.ACTIVE })
			.lean()
			.exec();
		if (!member) throw new InternalServerErrorException(Messages.NO_DATA_FOUND);
		return member as Member;
	}

	public async updateMember(memberId: ObjectId, input: MemberUpdate): Promise<Member> {
		const { memberNotify, ...fields } = input;
		const update: T = { ...fields };

		// Dot paths, so turning one toggle off does not reset the other two to their defaults.
		for (const [key, value] of Object.entries(memberNotify ?? {})) {
			if (value !== undefined) update[`memberNotify.${key}`] = value;
		}

		const member = await this.memberModel
			.findOneAndUpdate(
				{ _id: memberId, memberStatus: MemberStatus.ACTIVE },
				{ $set: update },
				{ new: true },
			)
			.lean()
			.exec();
		if (!member) throw new InternalServerErrorException(Messages.UPDATE_FAILED);
		return member as Member;
	}

	/* ───────────────────────── admin ───────────────────────── */

	public async getAllMembersByAdmin(input: MembersInquiry): Promise<Members> {
		const { page, limit, sort = 'createdAt', direction = Direction.DESC, search = {} } = input;

		const match: T = {};
		if (search.memberType) match.memberType = search.memberType;
		if (search.memberStatus) match.memberStatus = search.memberStatus;
		if (search.text) {
			const pattern = new RegExp(escapeRegex(search.text.trim()), 'i');
			match.$or = [{ memberEmail: pattern }, { memberFullName: pattern }];
		}

		const result = await this.memberModel
			.aggregate([
				{ $match: match },
				{ $sort: { [sort]: direction, _id: direction } },
				{
					$facet: {
						list: [
							{ $skip: (page - 1) * limit },
							{ $limit: limit },
							{ $project: { memberPassword: 0 } },
						],
						metaCounter: [{ $count: 'total' }],
					},
				},
			])
			.exec();

		return result[0] as Members;
	}

	/** Blocking or deleting signs the member out everywhere, immediately. */
	public async updateMemberByAdmin(input: MemberAdminUpdate): Promise<Member> {
		const _id = shapeIntoMongoObjectId(input._id);
		const update: T = { memberStatus: input.memberStatus };
		update.deletedAt = input.memberStatus === MemberStatus.DELETE ? new Date() : null;

		const member = await this.memberModel
			.findByIdAndUpdate(_id, update, { new: true })
			.lean()
			.exec();
		if (!member) throw new InternalServerErrorException(Messages.UPDATE_FAILED);

		if (input.memberStatus !== MemberStatus.ACTIVE) {
			await this.sessionService.revokeAll(_id);
			await this.authService.revokeAllAccessTokens(_id);
		}
		return member as Member;
	}
}
