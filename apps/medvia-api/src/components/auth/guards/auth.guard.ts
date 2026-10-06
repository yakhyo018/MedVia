import {
	BadRequestException,
	CanActivate,
	ExecutionContext,
	Injectable,
	UnauthorizedException,
} from '@nestjs/common';
import { AuthService } from '../auth.service';
import { Messages } from '../../../libs/enums/common.enum';

/** Login required. Rejects the request when no valid bearer token is present. */
@Injectable()
export class AuthGuard implements CanActivate {
	constructor(private readonly authService: AuthService) {}

	public async canActivate(context: ExecutionContext | any): Promise<boolean> {
		console.info('--- @guard() Authentication [AuthGuard] ---');
		if (context.contextType !== 'graphql') return false;

		const request = context.getArgByIndex(2).req;
		const bearerToken = request.headers.authorization;
		if (!bearerToken) throw new BadRequestException(Messages.TOKEN_NOT_EXIST);

		const token = bearerToken.split(' ')[1];
		const authMember = await this.authService.verifyToken(token);
		if (!authMember) throw new UnauthorizedException(Messages.NOT_AUTHENTICATED);

		request.body.authMember = authMember;
		return true;
	}
}
