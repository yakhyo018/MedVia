import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { TokenService } from '../token.service';

/**
 * Login required. Works for GraphQL and for the REST upload endpoint. On REST the member
 * goes on the request itself, not on req.body: multer replaces the body after guards run.
 */
@Injectable()
export class AuthGuard implements CanActivate {
	constructor(private readonly tokenService: TokenService) {}

	public async canActivate(context: ExecutionContext | any): Promise<boolean> {
		if (context.contextType === 'http') {
			const request = context.switchToHttp().getRequest();
			request.authMember = await this.tokenService.authenticate(request);
			return true;
		}
		if (context.contextType !== 'graphql') return false;

		const request = context.getArgByIndex(2).req;
		request.body.authMember = await this.tokenService.authenticate(request);
		return true;
	}
}
