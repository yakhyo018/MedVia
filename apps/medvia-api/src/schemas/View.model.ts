import { Schema } from 'mongoose';
import { ViewGroup } from '../libs/enums/view.enum';

/**
 * "Recently Visited", and the source of clinicViews. One row per member and target:
 * the first visit inserts it and bumps the counter, every later visit only refreshes
 * updatedAt so the page moves back to the top of the list.
 */
const ViewSchema = new Schema(
	{
		viewGroup: {
			type: String,
			enum: ViewGroup,
			required: true,
		},

		viewRefId: {
			type: Schema.Types.ObjectId,
			required: true,
		},

		memberId: {
			type: Schema.Types.ObjectId,
			required: true,
			ref: 'Member',
		},
	},
	{ timestamps: true, collection: 'views' },
);

ViewSchema.index({ memberId: 1, viewRefId: 1 }, { unique: true });

// Recently Visited tab: latest visit first.
ViewSchema.index({ memberId: 1, viewGroup: 1, updatedAt: -1 });

export default ViewSchema;
