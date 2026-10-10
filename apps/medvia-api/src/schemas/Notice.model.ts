import { Schema } from 'mongoose';
import { NoticeCategory, NoticeStatus } from '../libs/enums/notice.enum';
import { InquiryCategory } from '../libs/enums/inquiry.enum';
import { Language } from '../libs/enums/common.enum';

/** A translation the team enters by hand ("KO · missing" until it does). */
const NoticeTranslationSchema = new Schema(
	{
		lang: { type: String, enum: Language, required: true },
		title: { type: String, required: true },
		content: { type: String, required: true },
	},
	{ _id: false },
);

/**
 * A notice or an FAQ answer, written by the MedVia team in English with optional translations.
 * A reader gets their own language when it exists, English otherwise.
 */
const NoticeSchema = new Schema(
	{
		noticeCategory: {
			type: String,
			enum: NoticeCategory,
			required: true,
		},

		noticeStatus: {
			type: String,
			enum: NoticeStatus,
			default: NoticeStatus.HOLD,
		},

		// FAQ only: the tab it shows under (Booking, Payment…).
		noticeFaqCategory: {
			type: String,
			enum: InquiryCategory,
		},

		// Shown first, with the "Important" label.
		noticePinned: {
			type: Boolean,
			default: false,
		},

		// English, the base text.
		noticeTitle: {
			type: String,
			required: true,
			trim: true,
		},

		noticeContent: {
			type: String,
			required: true,
		},

		noticeTranslations: {
			type: [NoticeTranslationSchema],
			default: [],
		},

		noticeViews: {
			type: Number,
			default: 0,
		},

		// The date on the list; set the first time it goes ACTIVE, not on every edit.
		publishedAt: {
			type: Date,
		},

		// The admin who wrote it.
		memberId: {
			type: Schema.Types.ObjectId,
			required: true,
			ref: 'Member',
		},

		deletedAt: {
			type: Date,
		},
	},
	{ timestamps: true, collection: 'notices' },
);

// The public lists: notices pinned first then newest; FAQ by tab.
NoticeSchema.index({ noticeStatus: 1, noticeCategory: 1, noticePinned: -1, publishedAt: -1 });
NoticeSchema.index({ noticeStatus: 1, noticeCategory: 1, noticeFaqCategory: 1 });

export default NoticeSchema;
