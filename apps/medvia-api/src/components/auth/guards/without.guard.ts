import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { TokenService } from '../token.service';

/**
 * Optional login. Guests pass with authMember = null; a valid token attaches the
 * member, so one query can serve both. An invalid token is treated as a guest.
 */
@Injectable()
export class WithoutGuard implements CanActivate {
	constructor(private readonly tokenService: TokenService) {}

	public async canActivate(context: ExecutionContext | any): Promise<boolean> {
		if (context.contextType !== 'graphql') return false;

		const request = context.getArgByIndex(2).req;
		request.body.authMember = null;

		if (request.headers.authorization) {
			try {
				request.body.authMember = await this.tokenService.authenticate(request);
			} catch {
				request.body.authMember = null;
			}
		}
		return true;
	}
}
