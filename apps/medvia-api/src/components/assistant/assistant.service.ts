import {
	BadRequestException,
	ForbiddenException,
	Injectable,
	Logger,
	NotFoundException,
	ServiceUnavailableException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, ObjectId, Types } from 'mongoose';
import {
	AssistantMessageInput,
	AssistantReply,
	AssistantSessionView,
} from '../../libs/dto/assistant/assistant';
import { SlotHold } from '../../libs/dto/slot/slot';
import { AssistantSessionStatus } from '../../libs/enums/assistant.enum';
import { Language, Messages } from '../../libs/enums/common.enum';
import { AuthMember, T } from '../../libs/types/common';
import { RedisService } from '../../redis/redis.service';
import { AiService } from '../ai/ai.service';
import { AgentMessage, AgentToolResult } from '../ai/ai.types';
import { runTurn } from './assistant.loop';
import { SlotService } from '../booking/slot.service';
import { seoulDateOf } from '../booking/booking.rules';
import { AssistantTools } from './assistant.tools';
import { TOOL_BY_NAME, TOOL_SPECS } from './assistant.tool-specs';
import { checkArgs, DAILY_TURNS, dailyTurnsKey, MAX_TURNS, systemPrompt } from './assistant.rules';

/** When a turn cannot finish (the step limit, the provider failed mid-turn). */
const GAVE_UP: Partial<Record<Language, string>> = {
	[Language.EN]: 'I could not finish this request. Please try again with a little more detail.',
	[Language.RU]: 'Не удалось выполнить запрос. Попробуйте ещё раз и уточните детали.',
	[Language.UZ]: "So'rovni bajara olmadim. Iltimos, biroz batafsilroq yozib qayta urinib ko'ring.",
	[Language.KK]: 'Сұранысты орындай алмадым. Толығырақ жазып, қайта көріңіз.',
};

/**
 * The booking assistant. A turn (runTurn, assistant.loop.ts): the patient's message → the model
 * → the tools it asks for → the model again … until it answers. The model can read
 * (clinics, slots, reviews, the patient's bookings) and can *propose* a time; holding it is a
 * separate mutation only the patient can trigger (confirmHold). However the model is steered —
 * by a clinic's description, a review, or its own mistake — it cannot take a slot.
 */
@Injectable()
export class AssistantService {
	private readonly logger = new Logger(AssistantService.name);

	constructor(
		@InjectModel('AssistantSession') private readonly sessionModel: Model<T>,
		@InjectModel('Member') private readonly memberModel: Model<T>,
		private readonly aiService: AiService,
		private readonly tools: AssistantTools,
		private readonly slotService: SlotService,
		private readonly redisService: RedisService,
	) {}

	public async sendMessage(
		member: AuthMember,
		input: AssistantMessageInput,
	): Promise<AssistantReply> {
		const now = new Date();
		const lang = await this.consentedLanguage(member._id);
		await this.countToday(member._id, now);
		const session = await this.sessionFor(member._id, input.sessionId, lang);
		if (session.turnCount >= MAX_TURNS)
			throw new BadRequestException(Messages.ASSISTANT_SESSION_FULL);

		const system = systemPrompt(session.sessionLang, seoulDateOf(now));
		const reply: AssistantReply = {
			sessionId: String(session._id),
			text: '',
			clinics: [],
			slots: [],
			toolsUsed: [],
		};
		let proposal: T | undefined;
		const turn = await runTurn(session.turns, input.text.trim(), {
			provider: this.aiService.providerName,
			converse: (messages) => this.aiService.converse(system, messages, TOOL_SPECS),
			runTool: (call) => this.runTool(call, member, now, reply, (p) => (proposal = p)),
		});
		// Nothing usable happened: the message is not stored and not counted as a turn.
		if (turn.unavailable) throw new ServiceUnavailableException(Messages.ASSISTANT_UNAVAILABLE);
		reply.text = turn.text ?? GAVE_UP[session.sessionLang] ?? GAVE_UP.EN!;
		reply.toolsUsed = turn.toolsUsed;
		const added = turn.added;

		// Append-only, and only if nobody else wrote this session meanwhile (two tabs sending
		// at once would interleave two turns into one history).
		const set: T = proposal ? { pendingHold: proposal } : {};
		const saved = await this.sessionModel
			.findOneAndUpdate(
				{ _id: session._id, turnCount: session.turnCount },
				{ $push: { turns: { $each: added } }, $inc: { turnCount: 1 }, $set: set },
				{ new: true },
			)
			.lean()
			.exec();
		if (!saved) throw new BadRequestException(Messages.WRONG_STATUS);
		reply.pendingHold = saved.pendingHold ?? undefined;
		return reply;
	}

	/**
	 * The patient pressed Confirm. The proposal is taken off the session first (a conditional
	 * update: a double click confirms once), then held exactly as if the patient had picked the
	 * time in the booking form — the same transaction, the same rules. If someone took the time
	 * in between, holdSlots refuses and the patient asks the assistant again.
	 */
	public async confirmHold(memberId: ObjectId, sessionId: string): Promise<SlotHold> {
		const now = new Date();
		const before = await this.sessionModel
			.findOneAndUpdate(
				{
					_id: this.toObjectId(sessionId),
					memberId,
					sessionStatus: AssistantSessionStatus.ACTIVE,
					'pendingHold.expiresAt': { $gt: now },
				},
				{ $unset: { pendingHold: 1 } },
			)
			.lean()
			.exec();
		if (!before?.pendingHold) throw new BadRequestException(Messages.NO_PENDING_HOLD);
		const { treatmentId, doctorId, slotStart } = before.pendingHold;
		return await this.slotService.holdSlots(memberId, {
			treatmentId: String(treatmentId),
			doctorId: String(doctorId),
			slotStart,
		});
	}

	/** The active conversation as the patient sees it: their words and the assistant's answers. */
	public async getMySession(memberId: ObjectId): Promise<AssistantSessionView> {
		const session = await this.sessionModel
			.findOne({ memberId, sessionStatus: AssistantSessionStatus.ACTIVE })
			.sort({ updatedAt: -1 })
			.lean()
			.exec();
		if (!session) throw new NotFoundException(Messages.NO_DATA_FOUND);
		return this.present(session);
	}

	public async closeSession(memberId: ObjectId, sessionId: string): Promise<AssistantSessionView> {
		const closed = await this.sessionModel
			.findOneAndUpdate(
				{ _id: this.toObjectId(sessionId), memberId, sessionStatus: AssistantSessionStatus.ACTIVE },
				{ $set: { sessionStatus: AssistantSessionStatus.CLOSED }, $unset: { pendingHold: 1 } },
				{ new: true },
			)
			.lean()
			.exec();
		if (!closed) throw new NotFoundException(Messages.NO_DATA_FOUND);
		return this.present(closed);
	}

	/* ───────────────────────── helpers ───────────────────────── */

	/**
	 * Arguments are checked before anything runs; a bad call becomes an error result the model
	 * reads (and may correct), never an exception for the patient.
	 */
	private async runTool(
		call: { id: string; name: string; args: unknown; argsError?: string },
		member: AuthMember,
		now: Date,
		reply: AssistantReply,
		onProposal: (proposal: T) => void,
	): Promise<AgentToolResult> {
		const error = (content: string): AgentToolResult => ({
			callId: call.id,
			name: call.name,
			content,
			isError: true,
		});
		const spec = TOOL_BY_NAME.get(call.name);
		if (!spec) return error(`unknown tool ${call.name}`);
		if (call.argsError) return error(call.argsError);
		const checked = checkArgs(spec.parameters, call.args);
		if (!checked.ok) return error(checked.error);
		try {
			const outcome = await this.tools.run(call.name, checked.value, member, now);
			if (outcome.clinics) reply.clinics.push(...(outcome.clinics as never[]));
			if (outcome.slots) reply.slots.push(...(outcome.slots as never[]));
			if (outcome.proposal) onProposal(outcome.proposal);
			return { callId: call.id, name: call.name, content: JSON.stringify(outcome.content) };
		} catch (err: any) {
			return error(err?.response?.message ?? err?.message ?? 'the tool failed');
		}
	}

	/** Patient text may describe symptoms: it goes to a model only with the AI consent (AI-1). */
	private async consentedLanguage(memberId: ObjectId): Promise<Language> {
		const member = await this.memberModel
			.findById(memberId, { memberLang: 1, memberAiConsentAt: 1 })
			.lean()
			.exec();
		if (!member?.memberAiConsentAt) throw new ForbiddenException(Messages.AI_CONSENT_REQUIRED);
		return (member.memberLang as Language) ?? Language.EN;
	}

	/**
	 * 30 messages a Seoul day per patient: a free model's rate limit, a paid model's bill. A
	 * Redis counter with a TTL; if Redis is down the limit is skipped (the session cap still holds).
	 */
	private async countToday(memberId: ObjectId, now: Date): Promise<void> {
		const key = dailyTurnsKey(memberId, seoulDateOf(now));
		try {
			const used = await this.redisService.redis.incr(key);
			if (used === 1) await this.redisService.redis.expire(key, 2 * 24 * 60 * 60);
			if (used > DAILY_TURNS) throw new BadRequestException(Messages.ASSISTANT_DAILY_LIMIT);
		} catch (err) {
			if (err instanceof BadRequestException) throw err;
			this.logger.warn(`daily limit unavailable: ${(err as Error).message}`);
		}
	}

	/** The named session (the member's own, still active), else the active one, else a new one. */
	private async sessionFor(
		memberId: ObjectId,
		sessionId: string | undefined,
		lang: Language,
	): Promise<T> {
		if (sessionId) {
			const session = await this.sessionModel
				.findOne({
					_id: this.toObjectId(sessionId),
					memberId,
					sessionStatus: AssistantSessionStatus.ACTIVE,
				})
				.lean()
				.exec();
			if (!session) throw new NotFoundException(Messages.NO_DATA_FOUND);
			return session;
		}
		const active = await this.sessionModel
			.findOne({ memberId, sessionStatus: AssistantSessionStatus.ACTIVE })
			.sort({ updatedAt: -1 })
			.lean()
			.exec();
		if (active) return active;
		return (await this.sessionModel.create({ memberId, sessionLang: lang })).toObject();
	}

	private present(session: T): AssistantSessionView {
		const turns = (session.turns as AgentMessage[])
			.filter((t) => t.role !== 'tool' && t.text?.trim())
			.map((t) => ({ role: t.role, text: (t as { text: string }).text }));
		return { ...session, turns } as AssistantSessionView;
	}

	private toObjectId(id: string): ObjectId {
		if (!Types.ObjectId.isValid(id)) throw new NotFoundException(Messages.NO_DATA_FOUND);
		return new Types.ObjectId(id) as unknown as ObjectId;
	}
}
