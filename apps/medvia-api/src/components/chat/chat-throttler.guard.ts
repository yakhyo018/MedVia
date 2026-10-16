import { Injectable } from '@nestjs/common';
import { GqlThrottlerGuard } from '../auth/guards/gql-throttler.guard';

/**
 * Message flood control, counted per member: a chat is used signed in, so the member is the
 * fair unit — one clinic team behind one office IP must not share a limit. Runs after
 * RolesGuard, which has put the member on the request.
 */
@Injectable()
export class ChatThrottlerGuard extends GqlThrottlerGuard {
	protected async getTracker(req: Record<string, any>): Promise<string> {
		const memberId = req.body?.authMember?._id;
		return memberId ? `chat:${String(memberId)}` : await super.getTracker(req);
	}
}
