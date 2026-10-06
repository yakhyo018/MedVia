import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { AuthService } from '../auth.service';

/**
 * Optional login. Guests pass through with authMember = null, logged-in members
 * get their member attached, so one query can serve both.
 */
@Injectable()
export class WithoutGuard implements CanActivate {
	constructor(private readonly authService: AuthService) {}

	public async canActivate(context: ExecutionContext | any): Promise<boolean> {
		console.info('--- @guard() Authentication [WithoutGuard] ---');
		if (context.contextType !== 'graphql') return false;

		const request = context.getArgByIndex(2).req;
		const bearerToken = request.headers.authorization;
		request.body.authMember = null;

		if (bearerToken) {
			try {
				const token = bearerToken.split(' ')[1];
				request.body.authMember = await this.authService.verifyToken(token);
			} catch {
				request.body.authMember = null;
			}
		}

		return true;
	}
}
