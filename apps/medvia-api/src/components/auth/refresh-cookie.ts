import type { CookieOptions, Request, Response } from 'express';
import { REFRESH_COOKIE, REFRESH_TOKEN_TTL_DAYS } from './auth.constants';

/**
 * httpOnly: page JavaScript can never read it, so an XSS bug cannot steal it.
 * sameSite lax: other sites cannot make the browser send it with a POST.
 * path /graphql: it is not sent with requests for images or other routes.
 */
function cookieOptions(): CookieOptions {
	return {
		httpOnly: true,
		sameSite: 'lax',
		secure: process.env.NODE_ENV === 'production',
		path: '/graphql',
	};
}

export function setRefreshCookie(res: Response, token: string): void {
	res.cookie(REFRESH_COOKIE, token, {
		...cookieOptions(),
		maxAge: REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
	});
}

export function clearRefreshCookie(res: Response): void {
	res.clearCookie(REFRESH_COOKIE, cookieOptions());
}

export function readRefreshCookie(req: Request): string | null {
	return req.cookies?.[REFRESH_COOKIE] || null;
}
