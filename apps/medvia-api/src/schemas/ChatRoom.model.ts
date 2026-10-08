import { Schema } from 'mongoose';

/**
 * One conversation between one patient and one clinic, across all their bookings. Opened by
 * the patient from the clinic page, or by the server when a booking request is sent.
 *
 * The last message is a reference, not a copy of its text: the patient's list shows it in the
 * patient's language, the clinic's list in Korean, and the message holds both.
 */
const ChatRoomSchema = new Schema(
	{
		roomLastMessageId: {
			type: Schema.Types.ObjectId,
			ref: 'ChatMessage',
		},

		// Orders both conversation lists; the room's creation time until the first message.
		roomLastAt: {
			type: Date,
			required: true,
		},

		// Unread state, not a counter: $inc on every message from the other side, 0 on read.
		roomUnreadPatient: {
			type: Number,
			default: 0,
		},

		roomUnreadClinic: {
			type: Number,
			default: 0,
		},

		memberId: {
			type: Schema.Types.ObjectId,
			required: true,
			ref: 'Member',
		},

		clinicId: {
			type: Schema.Types.ObjectId,
			required: true,
			ref: 'Clinic',
		},
	},
	{ timestamps: true, collection: 'chatRooms' },
);

// One room per patient and clinic; openRoom is an upsert on it.
ChatRoomSchema.index({ memberId: 1, clinicId: 1 }, { unique: true });

// The patient's list and the clinic's list, most recent conversation first.
ChatRoomSchema.index({ memberId: 1, roomLastAt: -1 });
ChatRoomSchema.index({ clinicId: 1, roomLastAt: -1 });

export default ChatRoomSchema;
