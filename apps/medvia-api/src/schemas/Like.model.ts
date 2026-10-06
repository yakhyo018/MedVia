import { Schema } from 'mongoose';
import { LikeGroup } from '../libs/enums/like.enum';

/** "My Favorites": a saved clinic (doctors, articles and comments join later). */
const LikeSchema = new Schema(
	{
		likeGroup: {
			type: String,
			enum: LikeGroup,
			required: true,
		},

		likeRefId: {
			type: Schema.Types.ObjectId,
			required: true,
		},

		memberId: {
			type: Schema.Types.ObjectId,
			required: true,
			ref: 'Member',
		},
	},
	{ timestamps: { createdAt: true, updatedAt: false }, collection: 'likes' },
);

// One like per member and target. The toggle relies on this to stay correct under
// double clicks: the second insert fails instead of counting twice.
LikeSchema.index({ memberId: 1, likeRefId: 1 }, { unique: true });

// Favorites tab: equality on member and group, then newest first.
LikeSchema.index({ memberId: 1, likeGroup: 1, createdAt: -1 });

export default LikeSchema;
