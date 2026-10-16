import { Schema } from 'mongoose';
import { BoardArticleCategory, BoardArticleStatus } from '../libs/enums/board-article.enum';
import { Language } from '../libs/enums/common.enum';

/**
 * A community post: a patient's question (QNA), a doctor's or the admin's health tip
 * (HEALTH_TIP), or a free-board post. Published at once; moderated after reports.
 * Photos only on health tips (at most two); no tags, no hard deletes (M8 review).
 */
const BoardArticleSchema = new Schema(
	{
		articleCategory: {
			type: String,
			enum: BoardArticleCategory,
			required: true,
		},

		articleStatus: {
			type: String,
			enum: BoardArticleStatus,
			default: BoardArticleStatus.ACTIVE,
		},

		articleTitle: {
			type: String,
			required: true,
			trim: true,
		},

		articleContent: {
			type: String,
			required: true,
		},

		// HEALTH_TIP only, 0–2 paths from /upload/image?target=article; the first is the cover.
		articleImages: {
			type: [String],
			default: [],
		},

		// The language it was written in — the doctors' Q&A list will translate from it.
		articleLang: {
			type: String,
			enum: Language,
			required: true,
		},

		// QNA: a doctor has commented ("Doctor answered"); the "Waiting" filter is its negation.
		articleAnswered: {
			type: Boolean,
			default: false,
		},

		articleLikes: { type: Number, default: 0 },
		articleViews: { type: Number, default: 0 },
		articleComments: { type: Number, default: 0 },

		// Pending reports (distinct members); at 5 the post hides itself until an admin decides,
		// and the decision closes them and sets this back to 0.
		articleReports: { type: Number, default: 0 },

		memberId: {
			type: Schema.Types.ObjectId,
			required: true,
			ref: 'Member',
		},

		deletedAt: {
			type: Date,
		},
	},
	{ timestamps: true, collection: 'boardArticles' },
);

// A board, newest first — the default list.
BoardArticleSchema.index({ articleStatus: 1, articleCategory: 1, createdAt: -1 });

// A board by popularity.
BoardArticleSchema.index({ articleStatus: 1, articleCategory: 1, articleLikes: -1 });

// "My Articles" and an author's page.
BoardArticleSchema.index({ memberId: 1, createdAt: -1 });

// The admin's "Reported" tab: only posts that have reports are in this index.
BoardArticleSchema.index(
	{ articleReports: -1, createdAt: -1 },
	{ partialFilterExpression: { articleReports: { $gt: 0 } } },
);

export default BoardArticleSchema;
