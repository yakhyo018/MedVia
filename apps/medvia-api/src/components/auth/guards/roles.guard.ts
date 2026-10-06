import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { TokenService } from '../token.service';
import { Messages } from '../../../libs/enums/common.enum';
import { ROLES_KEY } from '../decorators/roles.decorator';

/** Login required, and memberType must be one of the @Roles() values. */
@Injectable()
export class RolesGuard implements CanActivate {
	constructor(
		private readonly reflector: Reflector,
		private readonly tokenService: TokenService,
	) {}

	public async canActivate(context: ExecutionContext | any): Promise<boolean> {
		const roles = this.reflector.get<string[]>(ROLES_KEY, context.getHandler());
		if (!roles) return true;
		if (context.contextType !== 'graphql') return false;

		const request = context.getArgByIndex(2).req;
		const authMember = await this.tokenService.authenticate(request);
		if (!roles.includes(authMember.memberType)) {
			throw new ForbiddenException(Messages.ONLY_SPECIFIC_ROLES_ALLOWED);
		}

		request.body.authMember = authMember;
		return true;
	}
}
