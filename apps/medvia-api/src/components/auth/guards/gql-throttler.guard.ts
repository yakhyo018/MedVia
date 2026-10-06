import { ExecutionContext, Injectable } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * ThrottlerGuard reads req/res from an HTTP context; GraphQL keeps them in its own.
 *
 * The counter is keyed by IP + email, not IP alone: a whole office or a mobile carrier
 * can share one IP, and an attacker guessing one account's password is what we limit.
 */
@Injectable()
export class GqlThrottlerGuard extends ThrottlerGuard {
	getRequestResponse(context: ExecutionContext) {
		const ctx = GqlExecutionContext.create(context).getContext();
		return { req: ctx.req, res: ctx.res };
	}

	protected async getTracker(req: Record<string, any>): Promise<string> {
		const ip = req.ips?.length ? req.ips[0] : req.ip;
		const email = req.body?.variables?.input?.memberEmail;
		return email ? `${ip}:${String(email).toLowerCase().trim()}` : ip;
	}
}
