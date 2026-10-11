import { Schema } from 'mongoose';
import { CommentStatus } from '../libs/enums/comment.enum';
import { Language } from '../libs/enums/common.enum';
import { MemberType } from '../libs/enums/member.enum';

/**
 * A comment on a community post — flat, no replies (M8 review). A doctor's comment on a
 * question is the "doctor answer". `articleId` directly: comments only ever belong to posts.
 */
const CommentSchema = new Schema(
	{
		commentStatus: {
			type: String,
			enum: CommentStatus,
			default: CommentStatus.ACTIVE,
		},

		commentContent: {
			type: String,
			required: true,
		},

		commentLang: {
			type: String,
			enum: Language,
			required: true,
		},

		commentReports: { type: Number, default: 0 },

		// The writer's member type, copied once (it never changes): the doctor badge in lists,
		// and articleAnswered is recomputed from the ACTIVE comments of doctors.
		commentAuthorType: {
			type: String,
			enum: MemberType,
			required: true,
		},

		articleId: {
			type: Schema.Types.ObjectId,
			required: true,
			ref: 'BoardArticle',
		},

		memberId: {
			type: Schema.Types.ObjectId,
			required: true,
			ref: 'Member',
		},

		deletedAt: {
			type: Date,
		},
	},
	{ timestamps: true, collection: 'comments' },
);

// The comments under a post, oldest first — a conversation reads top to bottom.
CommentSchema.index({ articleId: 1, commentStatus: 1, createdAt: 1 });

// The admin's user detail: a member's comments (and the reports against them).
CommentSchema.index({ memberId: 1 });

export default CommentSchema;
