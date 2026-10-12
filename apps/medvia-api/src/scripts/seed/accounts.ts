import * as fs from 'fs';
import * as path from 'path';
import mongoose, { Model, Schema } from 'mongoose';
import MemberSchema from '../../schemas/Member.model';
import ClinicSchema from '../../schemas/Clinic.model';
import DoctorSchema from '../../schemas/Doctor.model';
import TreatmentSchema from '../../schemas/Treatment.model';
import SlotSchema from '../../schemas/Slot.model';
import BookingSchema from '../../schemas/Booking.model';
import ReviewSchema from '../../schemas/Review.model';
import BoardArticleSchema from '../../schemas/BoardArticle.model';
import CommentSchema from '../../schemas/Comment.model';
import NoticeSchema from '../../schemas/Notice.model';
import FollowSchema from '../../schemas/Follow.model';
import LikeSchema from '../../schemas/Like.model';
import ViewSchema from '../../schemas/View.model';
import ReportSchema from '../../schemas/Report.model';
import NotificationSchema from '../../schemas/Notification.model';
import ChatRoomSchema from '../../schemas/ChatRoom.model';
import ChatMessageSchema from '../../schemas/ChatMessage.model';
import AccessLogSchema from '../../schemas/AccessLog.model';
import InquirySchema from '../../schemas/Inquiry.model';
import SessionSchema from '../../schemas/Session.model';
import AssistantSessionSchema from '../../schemas/AssistantSession.model';
import { T } from '../../libs/types/common';
import { escapeRegex } from '../../libs/config';

/** The repository root: uploaded paths in the database ("uploads/clinic/x.png") are relative to it. */
export const ROOT = path.join(__dirname, '..', '..', '..', '..', '..');

export type Models = Record<string, Model<T>>;

export function models(): Models {
	const def = (name: string, schema: Schema) =>
		mongoose.models[name] ?? mongoose.model<T>(name, schema);
	return {
		Member: def('Member', MemberSchema),
		Clinic: def('Clinic', ClinicSchema),
		Doctor: def('Doctor', DoctorSchema),
		Treatment: def('Treatment', TreatmentSchema),
		Slot: def('Slot', SlotSchema),
		Booking: def('Booking', BookingSchema),
		Review: def('Review', ReviewSchema),
		BoardArticle: def('BoardArticle', BoardArticleSchema),
		Comment: def('Comment', CommentSchema),
		Notice: def('Notice', NoticeSchema),
		Follow: def('Follow', FollowSchema),
		Like: def('Like', LikeSchema),
		View: def('View', ViewSchema),
		Report: def('Report', ReportSchema),
		Notification: def('Notification', NotificationSchema),
		ChatRoom: def('ChatRoom', ChatRoomSchema),
		ChatMessage: def('ChatMessage', ChatMessageSchema),
		AccessLog: def('AccessLog', AccessLogSchema),
		Inquiry: def('Inquiry', InquirySchema),
		Session: def('Session', SessionSchema),
		AssistantSession: def('AssistantSession', AssistantSessionSchema),
	};
}

export interface RemovalPlan {
	/** collection → documents that go */
	counts: Record<string, number>;
	/** Runs the deletes. */
	run: () => Promise<void>;
}

/**
 * Everything owned by the accounts whose email ends with `domain` ("@seed.medvia.test",
 * "@medvia.test"), and everything that points at it: their clinics, doctors, treatments,
 * slots, bookings, reviews, chats, posts, likes, views, follows, notifications, sessions and
 * uploaded clinic / doctor / member photos.
 *
 * Seed and test data only — the app itself never hard-deletes (status DELETE + deletedAt).
 * The domain is matched as the whole tail after "@", so "@medvia.test" never matches
 * "x@seed.medvia.test".
 */
export async function planAccountRemoval(m: Models, domain: string): Promise<RemovalPlan> {
	const members = await m.Member.find(
		{ memberEmail: { $regex: `${escapeRegex(domain)}$`, $options: 'i' } },
		{ _id: 1, memberImage: 1 },
	).lean();
	const memberIds = members.map((x) => x._id);

	const clinics = await m.Clinic.find(
		{ memberId: { $in: memberIds } },
		{ _id: 1, clinicImages: 1 },
	).lean();
	const clinicIds = clinics.map((c) => c._id);
	const doctors = await m.Doctor.find(
		{ $or: [{ clinicId: { $in: clinicIds } }, { memberId: { $in: memberIds } }] },
		{ _id: 1, doctorImage: 1 },
	).lean();
	const doctorIds = doctors.map((d) => d._id);
	const articleIds = (
		await m.BoardArticle.find({ memberId: { $in: memberIds } }, { _id: 1 }).lean()
	).map((a) => a._id);
	const bookingIds = (
		await m.Booking.find(
			{ $or: [{ clinicId: { $in: clinicIds } }, { memberId: { $in: memberIds } }] },
			{ _id: 1 },
		).lean()
	).map((b) => b._id);
	const roomIds = (
		await m.ChatRoom.find(
			{ $or: [{ clinicId: { $in: clinicIds } }, { memberId: { $in: memberIds } }] },
			{ _id: 1 },
		).lean()
	).map((r) => r._id);
	const refIds = [...clinicIds, ...doctorIds, ...articleIds];

	const filters: [string, T][] = [
		['ChatMessage', { roomId: { $in: roomIds } }],
		['ChatRoom', { _id: { $in: roomIds } }],
		['Review', { bookingId: { $in: bookingIds } }],
		['AccessLog', { bookingId: { $in: bookingIds } }],
		['Slot', { clinicId: { $in: clinicIds } }],
		['Treatment', { clinicId: { $in: clinicIds } }],
		['Comment', { $or: [{ memberId: { $in: memberIds } }, { articleId: { $in: articleIds } }] }],
		['Report', { $or: [{ memberId: { $in: memberIds } }, { reportRefId: { $in: articleIds } }] }],
		['Follow', { $or: [{ followerId: { $in: memberIds } }, { followingId: { $in: memberIds } }] }],
		['Like', { $or: [{ memberId: { $in: memberIds } }, { likeRefId: { $in: refIds } }] }],
		['View', { $or: [{ memberId: { $in: memberIds } }, { viewRefId: { $in: refIds } }] }],
		['Notice', { memberId: { $in: memberIds } }],
		['Notification', { receiverId: { $in: memberIds } }],
		['Inquiry', { memberId: { $in: memberIds } }],
		['Session', { memberId: { $in: memberIds } }],
		['AssistantSession', { memberId: { $in: memberIds } }],
		// Parents last: a crash halfway leaves orphans of children, never children of the dead.
		['Booking', { _id: { $in: bookingIds } }],
		['BoardArticle', { _id: { $in: articleIds } }],
		['Doctor', { _id: { $in: doctorIds } }],
		['Clinic', { _id: { $in: clinicIds } }],
		['Member', { _id: { $in: memberIds } }],
	];

	const counts: Record<string, number> = {};
	for (const [name, filter] of filters)
		counts[name] = memberIds.length ? await m[name].countDocuments(filter) : 0;

	const images = [
		...clinics.flatMap((c) => c.clinicImages ?? []),
		...doctors.map((d) => d.doctorImage),
		...members.map((x) => x.memberImage),
	].filter(
		(image): image is string =>
			typeof image === 'string' && /^uploads\/[\w-]+\/[\w.-]+$/.test(image),
	);

	const run = async () => {
		if (!memberIds.length) return;
		for (const [name, filter] of filters) await m[name].deleteMany(filter);
		for (const image of images) fs.rmSync(path.join(ROOT, image), { force: true });
	};

	return { counts, run };
}
