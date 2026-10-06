import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { OAuth2Client } from 'google-auth-library';
import { Messages } from '../../libs/enums/common.enum';

export interface GoogleProfile {
	googleId: string;
	email: string;
	emailVerified: boolean;
	fullName: string;
	image: string;
}

/**
 * Verifies the ID token the browser received from Google: signature against Google's
 * public keys, expiry, and that it was issued for our client id (the audience).
 * Without the audience check, a token issued to any other app would sign users in here.
 */
@Injectable()
export class GoogleService {
	private readonly client = new OAuth2Client();

	public async verify(idToken: string): Promise<GoogleProfile> {
		const audience = process.env.GOOGLE_CLIENT_ID;
		if (!audience) throw new BadRequestException(Messages.GOOGLE_NOT_CONFIGURED);

		try {
			const ticket = await this.client.verifyIdToken({ idToken, audience });
			const payload = ticket.getPayload();
			if (!payload?.sub || !payload.email) throw new Error('payload without sub or email');

			return {
				googleId: payload.sub,
				email: payload.email.toLowerCase(),
				emailVerified: payload.email_verified === true,
				fullName: payload.name || payload.email.split('@')[0],
				image: payload.picture || '',
			};
		} catch {
			throw new UnauthorizedException(Messages.GOOGLE_TOKEN_INVALID);
		}
	}
}
