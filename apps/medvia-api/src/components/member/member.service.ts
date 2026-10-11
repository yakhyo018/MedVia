import {
	BadRequestException,
	ForbiddenException,
	Injectable,
	InternalServerErrorException,
	NotFoundException,
	UnauthorizedException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, ObjectId, Types } from 'mongoose';
import type { Request, Response } from 'express';
import { Member, MemberDetail, Members } from '../../libs/dto/member/member';
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
import { AI_CONSENT_VERSION, escapeRegex, shapeIntoMongoObjectId } from '../../libs/config';
import { AuthService } from '../auth/auth.service';
import { GoogleService } from '../auth/google.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { AuditGroup } from '../../libs/enums/admin.enum';
import { memberAuditAction } from './member.rules';
import { BookingStatus } from '../../libs/enums/booking.enum';
import { BoardArticleStatus } from '../../libs/enums/board-article.enum';
import { effectiveStatus } from '../booking/booking.rules';

const DUPLICATE_KEY = 11000;

export interface EmailMemberFields {
	memberType: MemberType;
	memberEmail: string;
	memberPassword: string;
	memberFullName: string;
	memberPhone?: string;
	memberCountry?: string;
	memberLang?: Language;
	/** Doctor accounts: the clinic chose the password, so the doctor is asked to replace it. */
	memberMustChangePassword?: boolean;
}

@Injectable()
export class MemberService {
	constructor(
		@InjectModel('Member') private readonly memberModel: Model<Member>,
		// Read for the admin's user detail only. Models, not modules: Clinic and Doctor modules
		// import this one, and Booking imports Clinic — importing BookingModule would close a cycle.
		@InjectModel('Booking') private readonly bookingModel: Model<T>,
		@InjectModel('BoardArticle') private readonly articleModel: Model<T>,
		@InjectModel('Comment') private readonly commentModel: Model<T>,
		@InjectModel('Report') private readonly reportModel: Model<T>,
		private readonly authService: AuthService,
		private readonly googleService: GoogleService,
		private readonly auditLogService: AuditLogService,
	) {}

	/* ───────────────────────── sign up / sign in ───────────────────────── */

	public async signup(input: MemberInput, req: Request, res: Response): Promise<Member> {
		// termsAccepted is pulled out so it is not stored; @Equals(true) already enforced it.
		const { termsAccepted, ...fields } = input;
		const member = await this.createEmailMember(fields);
		return await this.authService.startSession(member, req, res);
	}

	/**
	 * Creates an email/password account. With a session it joins the caller's transaction —
	 * signupClinic creates the AGENT account and its clinic together or not at all.
	 */
	public async createEmailMember(fields: EmailMemberFields, session?: ClientSession): Promise<T> {
		const { memberPassword, ...profile } = fields;
		const now = new Date();

		try {
			const [member] = await this.memberModel.create(
				[
					{
						...profile,
						memberAuthType: MemberAuthType.EMAIL,
						memberPassword: await this.authService.hashPassword(memberPassword),
						memberTermsAt: now,
						memberLastLoginAt: now,
					},
				],
				{ session },
			);
			return member.toObject();
		} catch (err: any) {
			if (err?.code === DUPLICATE_KEY) throw new BadRequestException(Messages.USED_EMAIL);
			throw new BadRequestException(Messages.CREATE_FAILED);
		}
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

		return await this.authService.startSession(await this.touchLastLogin(member._id), req, res);
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

		return await this.authService.startSession(await this.touchLastLogin(member._id), req, res);
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
			await this.authService.endAllSessions(existing._id);
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

	private async touchLastLogin(memberId: any): Promise<T> {
		return (await this.memberModel
			.findByIdAndUpdate(memberId, { memberLastLoginAt: new Date() }, { new: true })
			.lean()
			.exec()) as T;
	}

	/* ───────────────────────── password ───────────────────────── */

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

		await this.authService.endAllSessions(member._id, req);
		return await this.authService.withAccessToken(updated as T);
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

	/**
	 * The patient's switch for AI translation in the chat. Agreeing stamps the time and the
	 * version of the consent text (set here, never by the client); withdrawing removes both,
	 * and from then on new messages are not sent to the AI provider.
	 */
	public async setAiConsent(memberId: ObjectId, agreed: boolean): Promise<Member> {
		const update = agreed
			? { $set: { memberAiConsentAt: new Date(), memberAiConsentVersion: AI_CONSENT_VERSION } }
			: { $unset: { memberAiConsentAt: 1, memberAiConsentVersion: 1 } };
		const member = await this.memberModel
			.findOneAndUpdate({ _id: memberId, memberStatus: MemberStatus.ACTIVE }, update, { new: true })
			.lean()
			.exec();
		if (!member) throw new InternalServerErrorException(Messages.UPDATE_FAILED);
		return member as Member;
	}

	/**
	 * A clinic resets a doctor's password (there is no email to send a reset link to).
	 * The new password is temporary again, and every device of the doctor is signed out.
	 */
	public async setTemporaryPassword(memberId: ObjectId, password: string): Promise<void> {
		const member = await this.memberModel
			.findOneAndUpdate(
				{ _id: memberId, memberStatus: MemberStatus.ACTIVE },
				{
					memberPassword: await this.authService.hashPassword(password),
					memberMustChangePassword: true,
				},
			)
			.exec();
		if (!member) throw new BadRequestException(Messages.UPDATE_FAILED);
		await this.authService.endAllSessions(memberId);
	}

	/**
	 * Closes an account owned by someone else's decision — a clinic removing its doctor.
	 * Joins the caller's transaction; the caller signs the member out after the commit.
	 */
	public async closeAccount(memberId: ObjectId, session?: ClientSession): Promise<void> {
		await this.memberModel
			.updateOne(
				{ _id: memberId },
				{ memberStatus: MemberStatus.DELETE, deletedAt: new Date() },
				{ session },
			)
			.exec();
	}

	/** Signs a member out everywhere — used after closeAccount commits. */
	public async signOutEverywhere(memberId: ObjectId): Promise<void> {
		await this.authService.endAllSessions(memberId);
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

	/**
	 * The admin's user detail: the account, its activity, its last bookings — never the medical
	 * answers (the admin sees that they were read, in the access log, not what they say).
	 */
	public async getMemberDetailByAdmin(memberId: string): Promise<MemberDetail> {
		if (!Types.ObjectId.isValid(memberId)) throw new NotFoundException(Messages.NO_DATA_FOUND);
		const _id = shapeIntoMongoObjectId(memberId);
		const member = await this.memberModel.findById(_id, { memberPassword: 0 }).lean().exec();
		if (!member) throw new NotFoundException(Messages.NO_DATA_FOUND);

		const [completedVisits, noShows, posts, articleIds, commentIds, bookings] = await Promise.all([
			this.bookingModel
				.countDocuments({ memberId: _id, bookingStatus: BookingStatus.COMPLETED })
				.exec(),
			this.bookingModel
				.countDocuments({ memberId: _id, bookingStatus: BookingStatus.NO_SHOW })
				.exec(),
			this.articleModel
				.countDocuments({ memberId: _id, articleStatus: { $ne: BoardArticleStatus.DELETE } })
				.exec(),
			this.articleModel.distinct('_id', { memberId: _id }).exec(),
			this.commentModel.distinct('_id', { memberId: _id }).exec(),
			this.bookingModel
				.aggregate([
					{ $match: { memberId: _id } },
					{ $sort: { bookingDate: -1, _id: -1 } },
					{ $limit: 10 },
					{
						$lookup: {
							from: 'clinics',
							localField: 'clinicId',
							foreignField: '_id',
							pipeline: [{ $project: { clinicName: 1 } }],
							as: 'clinic',
						},
					},
					{
						$lookup: {
							from: 'treatments',
							localField: 'treatmentId',
							foreignField: '_id',
							pipeline: [{ $project: { treatmentName: 1 } }],
							as: 'treatment',
						},
					},
				])
				.exec(),
		]);
		const reportsAgainst = await this.reportModel
			.countDocuments({ reportRefId: { $in: [...articleIds, ...commentIds] } })
			.exec();

		const now = new Date();
		return {
			member: member as Member,
			completedVisits,
			noShows,
			posts,
			reportsAgainst,
			recentBookings: bookings.map((b: T) => ({
				_id: b._id,
				bookingCode: b.bookingCode,
				bookingStatus: effectiveStatus(b, now),
				bookingDate: b.bookingDate,
				clinicName: b.clinic[0]?.clinicName,
				treatmentName: b.treatment[0]?.treatmentName,
			})),
		};
	}

	/**
	 * Blocking or deleting signs the member out everywhere, immediately. A real change is an
	 * admin decision and goes to the audit log; repeating the same status does not.
	 */
	public async updateMemberByAdmin(adminId: ObjectId, input: MemberAdminUpdate): Promise<Member> {
		const _id = shapeIntoMongoObjectId(input._id);
		const update: T = { memberStatus: input.memberStatus };
		update.deletedAt = input.memberStatus === MemberStatus.DELETE ? new Date() : null;

		const before = await this.memberModel.findByIdAndUpdate(_id, update).lean().exec();
		if (!before) throw new InternalServerErrorException(Messages.UPDATE_FAILED);

		if (input.memberStatus !== MemberStatus.ACTIVE) await this.authService.endAllSessions(_id);
		const action = memberAuditAction(before.memberStatus, input.memberStatus);
		if (action) {
			await this.auditLogService.record({
				auditAction: action,
				auditGroup: AuditGroup.MEMBER,
				auditRefId: _id as ObjectId,
				memberId: adminId,
			});
		}
		return { ...before, ...update } as Member;
	}
}
