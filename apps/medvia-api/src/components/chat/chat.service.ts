import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, ObjectId, Types } from 'mongoose';
import { ChatMessage, ChatMessages, ChatRoom } from '../../libs/dto/chat/chat';
import { MessageSendInput, RoomMessagesInquiry } from '../../libs/dto/chat/chat.input';
import { BookingActor, BookingStatus } from '../../libs/enums/booking.enum';
import { MessageType, SenderType, TranslationStatus } from '../../libs/enums/chat.enum';
import { Language, Messages } from '../../libs/enums/common.enum';
import { AuthMember, T } from '../../libs/types/common';
import { shapeIntoMongoObjectId, toDisplayName } from '../../libs/config';
import { ClinicService } from '../clinic/clinic.service';
import { AiService } from '../ai/ai.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { NotificationService } from '../notification/notification.service';
import { NotificationType } from '../../libs/enums/notification.enum';
import {
	bookingLine,
	decodeCursor,
	encodeCursor,
	needsRetry,
	olderThan,
	otherUnread,
	planTranslation,
	retryFilter,
	roomScope,
	targetLang,
	sideOf,
	textFor,
	translationUpdate,
	unreadForLine,
	unreadOf,
	senderLang,
	viewerLang,
} from './chat.rules';

const ROOMS_MAX = 100;

interface Viewer {
	side: SenderType;
	scope: T;
	memberId: ObjectId;
}

@Injectable()
export class ChatService {
	private readonly logger = new Logger(ChatService.name);

	constructor(
		@InjectModel('ChatRoom') private readonly roomModel: Model<T>,
		@InjectModel('ChatMessage') private readonly messageModel: Model<T>,
		@InjectModel('Member') private readonly memberModel: Model<T>,
		private readonly clinicService: ClinicService,
		private readonly gateway: RealtimeGateway,
		private readonly aiService: AiService,
		private readonly notificationService: NotificationService,
	) {}

	/* ───────────────────────── patient ───────────────────────── */

	/**
	 * "Chat with the clinic" on a clinic page: the room of this patient and clinic, created on
	 * first use. An upsert on the unique {memberId, clinicId} index, so two clicks give one room.
	 */
	public async openRoom(memberId: ObjectId, clinicId: string): Promise<ChatRoom> {
		const clinic = await this.clinicService.findActiveClinic(this.toObjectId(clinicId));
		if (!clinic) throw new NotFoundException(Messages.NO_DATA_FOUND);
		const room = await this.upsertRoom(memberId, clinic._id);
		const [view] = await this.roomsFor(SenderType.PATIENT, { _id: room._id });
		return view;
	}

	/* ───────────────────────── both sides ───────────────────────── */

	/** "Consultation Chat" for a patient, "Consultations" for a clinic — scoped by the token. */
	public async getMyRooms(authMember: AuthMember): Promise<ChatRoom[]> {
		const viewer = await this.viewerOf(authMember);
		return await this.roomsFor(viewer.side, viewer.scope);
	}

	/**
	 * One page of a room's history, newest first. The cursor is the position of the oldest
	 * message already shown; one extra row is read to know whether there is another page.
	 */
	public async getRoomMessages(
		authMember: AuthMember,
		input: RoomMessagesInquiry,
	): Promise<ChatMessages> {
		const viewer = await this.viewerOf(authMember);
		const room = await this.findRoom(viewer, input.roomId);

		const match: T = { roomId: room._id };
		if (input.before) Object.assign(match, olderThan(decodeCursor(input.before)));
		const rows = await this.messageModel
			.find(match)
			.sort({ createdAt: -1, _id: -1 })
			.limit(input.limit + 1)
			.lean()
			.exec();

		const page = rows.slice(0, input.limit);
		const patient = await this.patientOf(room.memberId);
		const lang = viewerLang(viewer.side, patient.memberLang);
		// Failed or stuck translations on this page are tried again in the background; the page
		// is answered now and the fixed messages arrive as message:translated.
		if (patient.consented) this.retryTranslations(room, page, patient.memberLang);
		return {
			list: page.map((m) => this.present(m, lang)),
			nextCursor: rows.length > input.limit ? encodeCursor(page[page.length - 1] as never) : null,
		};
	}

	/**
	 * Saved first, pushed second: the message exists before anyone is told about it, and a
	 * socket that is down loses only the push — the next history read has the message.
	 * Written in the sender's language; AI-1 adds the translation for the other side later.
	 */
	public async sendMessage(authMember: AuthMember, input: MessageSendInput): Promise<ChatMessage> {
		const viewer = await this.viewerOf(authMember);
		const room = await this.findRoom(viewer, input.roomId);
		const text = input.messageText.trim();
		if (!text) throw new BadRequestException(Messages.BAD_REQUEST);

		const patient = await this.patientOf(room.memberId);
		const messageLang = senderLang(viewer.side, patient.memberLang, input.messageLang);
		const target = targetLang(viewer.side, patient.memberLang);
		const message = await this.messageModel.create({
			messageType: MessageType.TEXT,
			senderType: viewer.side,
			messageText: text,
			messageLang,
			messageTranslationStatus: planTranslation(
				MessageType.TEXT,
				messageLang,
				target,
				patient.consented,
			),
			roomId: room._id,
			senderId: authMember._id,
		});
		await this.touchRoom(room, message, [otherUnread(viewer.side)]);

		const plain = message.toObject();
		this.gateway.emitToRoom(room, 'message:new', plain);
		// Not awaited: the sender gets an answer now; the translation follows over the socket.
		if (plain.messageTranslationStatus === TranslationStatus.PENDING) {
			void this.translate(room, plain._id, target);
		}
		await this.notifyMessage(room, viewer.side, authMember._id, patient.memberFullName, text);
		return this.present(plain, messageLang);
	}

	/** The viewer opened the room: their unread count goes to 0 on both their screens. */
	public async markRoomRead(authMember: AuthMember, roomId: string): Promise<ChatRoom> {
		const viewer = await this.viewerOf(authMember);
		const room = await this.findRoom(viewer, roomId);
		const updated = await this.roomModel
			.findByIdAndUpdate(room._id, { $set: { [unreadOf(viewer.side)]: 0 } }, { new: true })
			.lean()
			.exec();
		this.gateway.emitToRoom(room, 'room:updated', updated);
		await this.notificationService.markReadByRef(authMember._id, room._id);
		const [view] = await this.roomsFor(viewer.side, { _id: room._id });
		return view;
	}

	/* ───────────────────────── called by the booking module ───────────────────────── */

	/**
	 * "Booking confirmed · Laser Toning · 2026-09-22 14:00 KST" in the patient's room with the
	 * clinic, opening the room on the first request. Called after the booking committed, and
	 * never fails the booking: a lost line is logged, the booking stands.
	 */
	public async postBookingLine(
		booking: T,
		status: BookingStatus,
		actor: BookingActor,
		treatmentName: string,
		reason?: string,
	): Promise<void> {
		const text = bookingLine(status, treatmentName, booking.bookingDate, reason);
		if (!text) return;
		try {
			const room = await this.upsertRoom(booking.memberId, booking.clinicId);
			const message = await this.messageModel.create({
				messageType: MessageType.SYSTEM,
				senderType: SenderType.SYSTEM,
				messageText: text,
				messageLang: Language.EN,
				messageTranslationStatus: TranslationStatus.SKIPPED,
				roomId: room._id,
			});
			await this.touchRoom(room, message, unreadForLine(actor));
			this.gateway.emitToRoom(room, 'message:new', message.toObject());
		} catch (err: any) {
			this.logger.warn(`booking line for ${String(booking._id)} not posted: ${err.message}`);
		}
	}

	/* ───────────────────────── helpers ───────────────────────── */

	private async upsertRoom(memberId: unknown, clinicId: unknown): Promise<T> {
		try {
			return (await this.roomModel
				.findOneAndUpdate(
					{ memberId, clinicId },
					{ $setOnInsert: { memberId, clinicId, roomLastAt: new Date() } },
					{ upsert: true, new: true },
				)
				.lean()
				.exec()) as T;
		} catch (err: any) {
			// Two first messages at once: both upserts insert, the unique index keeps one.
			if (err?.code !== 11000) throw err;
			return (await this.roomModel.findOne({ memberId, clinicId }).lean().exec()) as T;
		}
	}

	/** The last message, the time that orders the lists, and "unread" for the other side. */
	private async touchRoom(room: T, message: T, unread: string[]): Promise<void> {
		const updated = await this.roomModel
			.findByIdAndUpdate(
				room._id,
				{
					$set: { roomLastMessageId: message._id, roomLastAt: message.createdAt },
					$inc: Object.fromEntries(unread.map((field) => [field, 1])),
				},
				{ new: true },
			)
			.lean()
			.exec();
		this.gateway.emitToRoom(room, 'room:updated', updated);
	}

	/**
	 * The bell of the other side: the clinic account hears "Feride K.", the patient hears the
	 * clinic's name. One unread line per room — NotificationService upserts it and never throws.
	 */
	private async notifyMessage(
		room: T,
		side: SenderType,
		senderId: ObjectId,
		patientFullName: string,
		text: string,
	): Promise<void> {
		const clinic = await this.clinicService.findClinicCard(room.clinicId);
		const fromPatient = side === SenderType.PATIENT;
		await this.notificationService.notify({
			type: NotificationType.NEW_MESSAGE,
			receiverId: fromPatient ? clinic?.memberId : room.memberId,
			refId: room._id,
			authorId: senderId,
			params: {
				senderName: fromPatient ? toDisplayName(patientFullName, true) : (clinic?.clinicName ?? ''),
				preview: text,
			},
		});
	}

	/** Rooms of one side with their last message, clinic card and patient name, newest first. */
	private async roomsFor(side: SenderType, match: T): Promise<ChatRoom[]> {
		const rooms = await this.roomModel
			.aggregate([
				{ $match: match },
				{ $sort: { roomLastAt: -1, _id: -1 } },
				{ $limit: ROOMS_MAX },
				{
					$lookup: {
						from: 'chatMessages',
						localField: 'roomLastMessageId',
						foreignField: '_id',
						as: 'last',
					},
				},
				{
					$lookup: {
						from: 'clinics',
						localField: 'clinicId',
						foreignField: '_id',
						pipeline: [{ $project: { clinicName: 1, clinicLogo: 1 } }],
						as: 'clinic',
					},
				},
				{
					$lookup: {
						from: 'members',
						localField: 'memberId',
						foreignField: '_id',
						pipeline: [{ $project: { memberFullName: 1, memberLang: 1 } }],
						as: 'patient',
					},
				},
			])
			.exec();

		return rooms.map((room: T) => {
			const patient = room.patient[0] ?? {};
			const last = room.last[0];
			return {
				_id: room._id,
				roomLastAt: room.roomLastAt,
				unread: room[unreadOf(side)] ?? 0,
				lastText: last ? textFor(last, viewerLang(side, patient.memberLang)) : null,
				memberId: room.memberId,
				clinicId: room.clinicId,
				clinicName: room.clinic[0]?.clinicName,
				clinicLogo: room.clinic[0]?.clinicLogo,
				patientName: toDisplayName(patient.memberFullName ?? '', true),
				patientLang: patient.memberLang,
			} as ChatRoom;
		});
	}

	/** The side and the room scope of the token's member. */
	private async viewerOf(authMember: AuthMember): Promise<Viewer> {
		const side = sideOf(authMember.memberType);
		let clinicId: unknown;
		if (side === SenderType.CLINIC) {
			const clinic = await this.clinicService.findClinicByMember(authMember._id);
			if (!clinic) throw new NotFoundException(Messages.NO_DATA_FOUND);
			clinicId = clinic._id;
		}
		return {
			side,
			scope: roomScope(side, { memberId: authMember._id, clinicId }),
			memberId: authMember._id,
		};
	}

	/** A room of the viewer; anyone else's room is "not found" — no hint that the id exists. */
	private async findRoom(viewer: Viewer, roomId: string): Promise<T> {
		const room = await this.roomModel
			.findOne({ _id: this.toObjectId(roomId), ...viewer.scope })
			.lean()
			.exec();
		if (!room) throw new NotFoundException(Messages.NO_DATA_FOUND);
		return room;
	}

	/** The patient of a room: the chat's target language, the AI consent, and the name for the bell. */
	private async patientOf(
		memberId: unknown,
	): Promise<{ memberLang: Language; consented: boolean; memberFullName: string }> {
		const member = await this.memberModel
			.findById(memberId, { memberLang: 1, memberAiConsentAt: 1, memberFullName: 1 })
			.lean()
			.exec();
		return {
			memberLang: (member?.memberLang as Language) ?? Language.EN,
			consented: !!member?.memberAiConsentAt,
			memberFullName: member?.memberFullName ?? '',
		};
	}

	/**
	 * Background: ask AiService (which never throws), store the result on the message — only if
	 * it is still PENDING, so a late answer never overwrites a newer one — and push it.
	 */
	private async translate(room: T, messageId: unknown, target: Language): Promise<void> {
		try {
			const message = await this.messageModel.findById(messageId, { messageText: 1 }).lean().exec();
			if (!message) return;
			const result = await this.aiService.translate(message.messageText, target);
			const updated = await this.messageModel
				.findOneAndUpdate(
					{ _id: messageId, messageTranslationStatus: TranslationStatus.PENDING },
					{ $set: translationUpdate(result, target) },
					{ new: true },
				)
				.lean()
				.exec();
			if (updated) this.gateway.emitToRoom(room, 'message:translated', updated);
		} catch (err: any) {
			this.logger.warn(`translation of ${String(messageId)} not stored: ${err.message}`);
		}
	}

	/**
	 * Each candidate is claimed with a conditional update (FAILED or stale PENDING → PENDING):
	 * two readers opening the same page retry a message once, not twice.
	 */
	private retryTranslations(room: T, page: T[], patientLang: Language): void {
		const now = new Date();
		for (const message of page.filter((m) => needsRetry(m, now))) {
			void this.messageModel
				.updateOne(
					{ _id: message._id, ...retryFilter(now) },
					{ $set: { messageTranslationStatus: TranslationStatus.PENDING } },
				)
				.exec()
				.then((claimed) => {
					if (claimed.modifiedCount === 1) {
						return this.translate(room, message._id, targetLang(message.senderType, patientLang));
					}
				})
				.catch((err) => this.logger.warn(`retry of ${String(message._id)} failed: ${err.message}`));
		}
	}

	private present(message: T, lang: Language): ChatMessage {
		return { ...message, displayText: textFor(message, lang) } as ChatMessage;
	}

	private toObjectId(id: string): ObjectId {
		if (!Types.ObjectId.isValid(id)) throw new NotFoundException(Messages.NO_DATA_FOUND);
		return shapeIntoMongoObjectId(id) as ObjectId;
	}
}
