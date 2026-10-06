import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { TokenService } from '../token.service';

/** Login required. */
@Injectable()
export class AuthGuard implements CanActivate {
	constructor(private readonly tokenService: TokenService) {}

	public async canActivate(context: ExecutionContext | any): Promise<boolean> {
		if (context.contextType !== 'graphql') return false;

		const request = context.getArgByIndex(2).req;
		request.body.authMember = await this.tokenService.authenticate(request);
		return true;
	}
}
