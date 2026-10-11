import { Schema } from 'mongoose';
import { AssistantSessionStatus } from '../libs/enums/assistant.enum';
import { Language } from '../libs/enums/common.enum';

/** 30 days after the last message: a patient may write symptoms here; it is not a record. */
export const ASSISTANT_SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;

/** The time the assistant proposed, waiting for the patient's Confirm. One at a time. */
const PendingHoldSchema = new Schema(
	{
		treatmentId: { type: Schema.Types.ObjectId, required: true, ref: 'Treatment' },
		doctorId: { type: Schema.Types.ObjectId, required: true, ref: 'Doctor' },
		slotStart: { type: Date, required: true },
		label: { type: String },
		clinicName: { type: String },
		treatmentName: { type: String },
		priceKrw: { type: Number },
		expiresAt: { type: Date, required: true },
	},
	{ _id: false },
);

/**
 * One conversation with the booking assistant. The history lives here, not in the client: a
 * client that sent its own history could forge the assistant's turns or a tool's result. Turns
 * are only ever appended (an edited history would also invalidate a model's thinking).
 */
const AssistantSessionSchema = new Schema(
	{
		sessionStatus: {
			type: String,
			enum: AssistantSessionStatus,
			default: AssistantSessionStatus.ACTIVE,
		},

		// The patient's language when the conversation started; replies are written in it.
		sessionLang: {
			type: String,
			enum: Language,
			required: true,
		},

		// MedVia's own message shape (AgentMessage): user text, the assistant's text and tool
		// calls (with the provider's raw reply), tool results. Provider-neutral on purpose.
		turns: {
			type: [Schema.Types.Mixed],
			default: [],
		},

		// Patient messages so far; also the guard against two messages racing in one session.
		turnCount: {
			type: Number,
			default: 0,
		},

		pendingHold: {
			type: PendingHoldSchema,
		},

		memberId: {
			type: Schema.Types.ObjectId,
			required: true,
			ref: 'Member',
		},
	},
	{ timestamps: true, collection: 'assistantSessions' },
);

// "My conversation": the member's active session, the latest first.
AssistantSessionSchema.index({ memberId: 1, sessionStatus: 1, updatedAt: -1 });

AssistantSessionSchema.index(
	{ updatedAt: 1 },
	{ expireAfterSeconds: ASSISTANT_SESSION_TTL_SECONDS },
);

export default AssistantSessionSchema;
