import { Schema } from 'mongoose';
import { MessageType, SenderType, TranslationStatus } from '../libs/enums/chat.enum';
import { Language } from '../libs/enums/common.enum';

const TranslationSchema = new Schema(
	{
		lang: { type: String, enum: Language, required: true },
		text: { type: String, required: true },
	},
	{ _id: false },
);

/**
 * One message, kept as written (messageText in messageLang) plus its translation for the other
 * side. "Show original" reads messageText; nothing is ever overwritten by a translation.
 */
const ChatMessageSchema = new Schema(
	{
		messageType: {
			type: String,
			enum: MessageType,
			default: MessageType.TEXT,
		},

		senderType: {
			type: String,
			enum: SenderType,
			required: true,
		},

		messageText: {
			type: String,
			required: true,
		},

		// The language it was written in: the sender's language until AI-1 detects it.
		messageLang: {
			type: String,
			enum: Language,
			required: true,
		},

		messageTranslations: {
			type: [TranslationSchema],
			default: [],
		},

		messageTranslationStatus: {
			type: String,
			enum: TranslationStatus,
			default: TranslationStatus.SKIPPED,
		},

		roomId: {
			type: Schema.Types.ObjectId,
			required: true,
			ref: 'ChatRoom',
		},

		// The member who wrote it; absent on SYSTEM lines.
		senderId: {
			type: Schema.Types.ObjectId,
			ref: 'Member',
		},
	},
	{ timestamps: true, collection: 'chatMessages' },
);

// The history of a room, newest first, paged by cursor: { createdAt, _id } < the last one seen.
ChatMessageSchema.index({ roomId: 1, createdAt: -1, _id: -1 });

export default ChatMessageSchema;
