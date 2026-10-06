import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { AuthService } from '../auth.service';

/** Login required. */
@Injectable()
export class AuthGuard implements CanActivate {
	constructor(private readonly authService: AuthService) {}

	public async canActivate(context: ExecutionContext | any): Promise<boolean> {
		if (context.contextType !== 'graphql') return false;

		const request = context.getArgByIndex(2).req;
		request.body.authMember = await this.authService.authenticate(request);
		return true;
	}
}
