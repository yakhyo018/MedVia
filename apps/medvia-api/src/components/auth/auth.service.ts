import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { T } from '../../libs/types/common';

@Injectable()
export class AuthService {
	constructor(private readonly jwtService: JwtService) {}

	/** Signs a member document into a JWT, with the password stripped. */
	public async createToken(member: T): Promise<string> {
		const source = member['_doc'] ? member['_doc'] : member;
		const payload: T = { ...source };
		delete payload.memberPassword;
		return await this.jwtService.signAsync(payload);
	}

	/** Throws when the token is missing, expired or tampered with. */
	public async verifyToken(token: string): Promise<T> {
		return await this.jwtService.verifyAsync(token);
	}
}
