import { Schema } from 'mongoose';

/**
 * One row per signed-in device. Holds a hash of the refresh token, never the token
 * itself: a leaked collection must not hand out working sessions.
 */
const SessionSchema = new Schema(
	{
		memberId: {
			type: Schema.Types.ObjectId,
			required: true,
			ref: 'Member',
		},

		sessionTokenHash: {
			type: String,
			required: true,
			unique: true,
		},

		// The hash this session rotated away from. Seeing it again means the old token
		// was replayed — by a second tab, or by someone who stole it.
		sessionPrevHash: {
			type: String,
		},

		sessionUserAgent: {
			type: String,
			default: '',
		},

		sessionExpiresAt: {
			type: Date,
			required: true,
		},

		sessionLastUsedAt: {
			type: Date,
		},
	},
	{ timestamps: true, collection: 'sessions' },
);

SessionSchema.index({ sessionPrevHash: 1 }, { sparse: true });

// Block or password change ends every session of one member at once.
SessionSchema.index({ memberId: 1 });

// TTL index: MongoDB deletes a session by itself once sessionExpiresAt passes.
SessionSchema.index({ sessionExpiresAt: 1 }, { expireAfterSeconds: 0 });

export default SessionSchema;
