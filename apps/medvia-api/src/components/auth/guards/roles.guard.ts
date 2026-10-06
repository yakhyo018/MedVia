import {
	BadRequestException,
	CanActivate,
	ExecutionContext,
	ForbiddenException,
	Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthService } from '../auth.service';
import { Messages } from '../../../libs/enums/common.enum';
import { ROLES_KEY } from '../decorators/roles.decorator';

/** Login required AND the member's memberType must be one of the @Roles() values. */
@Injectable()
export class RolesGuard implements CanActivate {
	constructor(
		private readonly reflector: Reflector,
		private readonly authService: AuthService,
	) {}

	public async canActivate(context: ExecutionContext | any): Promise<boolean> {
		const roles = this.reflector.get<string[]>(ROLES_KEY, context.getHandler());
		if (!roles) return true;

		console.info(`--- @guard() Authentication [RolesGuard]: ${roles} ---`);
		if (context.contextType !== 'graphql') return false;

		const request = context.getArgByIndex(2).req;
		const bearerToken = request.headers.authorization;
		if (!bearerToken) throw new BadRequestException(Messages.TOKEN_NOT_EXIST);

		const token = bearerToken.split(' ')[1];
		const authMember = await this.authService.verifyToken(token);
		const hasPermission = !!authMember && roles.includes(authMember.memberType);
		if (!hasPermission) throw new ForbiddenException(Messages.ONLY_SPECIFIC_ROLES_ALLOWED);

		request.body.authMember = authMember;
		return true;
	}
}
