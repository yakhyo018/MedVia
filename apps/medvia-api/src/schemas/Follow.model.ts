import { Schema } from 'mongoose';
import { FOLLOWABLE_MEMBER_TYPES } from '../libs/enums/member.enum';

/**
 * Member follows member: a clinic (AGENT), a doctor, or a community author (USER).
 *
 * followingType is copied from the followed member at follow time. A member's type never
 * changes, so the copy cannot go stale — and "My Followings" can split into tabs and count
 * them without a $lookup into members.
 */
const FollowSchema = new Schema(
	{
		followingId: {
			type: Schema.Types.ObjectId,
			required: true,
			ref: 'Member',
		},

		followingType: {
			type: String,
			enum: FOLLOWABLE_MEMBER_TYPES,
			required: true,
		},

		followerId: {
			type: Schema.Types.ObjectId,
			required: true,
			ref: 'Member',
		},
	},
	// A follow is created or removed, never edited.
	{ timestamps: { createdAt: true, updatedAt: false }, collection: 'follows' },
);

// One follow per pair; also serves "how many follow X" (prefix followingId).
FollowSchema.index({ followingId: 1, followerId: 1 }, { unique: true });

// "My Followings", newest first. The index above alone is not enough: it starts with
// followingId — a query on followerId cannot use it and scans the whole collection.
FollowSchema.index({ followerId: 1, createdAt: -1 });

export default FollowSchema;
