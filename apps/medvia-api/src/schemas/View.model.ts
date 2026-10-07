import { Schema } from 'mongoose';
import { ViewGroup } from '../libs/enums/view.enum';

/**
 * "Recently Visited", and the source of clinicViews / doctorViews. One row per member and
 * target: the first visit inserts it and bumps the counter, every later visit only
 * refreshes updatedAt so the page moves back to the top of the timeline.
 *
 * "Clear history" hides rows instead of deleting them. A deleted row would make the next
 * visit a "first" visit again, and the view counter would grow every time a patient
 * cleared their history.
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

		viewHidden: {
			type: Boolean,
			default: false,
		},
	},
	{ timestamps: true, collection: 'views' },
);

ViewSchema.index({ memberId: 1, viewRefId: 1 }, { unique: true });

// Recently Visited: one timeline of clinics, doctors (and articles in M8), latest first.
// viewHidden is filtered on the rows this index returns — a member's history is short.
ViewSchema.index({ memberId: 1, updatedAt: -1 });

export default ViewSchema;
