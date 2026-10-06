import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * Reads the member a guard put on the request.
 * `@AuthMember('_id')` gives one field, `@AuthMember()` the whole member.
 */
export const AuthMember = createParamDecorator((data: string, context: ExecutionContext | any) => {
	let request: any;

	if (context.contextType === 'graphql') {
		request = context.getArgByIndex(2).req;
		if (request.body.authMember) {
			request.body.authMember.authorization = request.headers?.authorization;
		}
	} else {
		request = context.switchToHttp().getRequest();
	}

	const member = request.body.authMember;
	if (!member) return null;
	return data ? member?.[data] : member;
});
