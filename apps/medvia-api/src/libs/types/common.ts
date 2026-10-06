import { ObjectId } from 'mongoose';
import { MemberType } from '../enums/member.enum';

export interface T {
	[key: string]: any;
}

export interface StatisticModifier {
	_id: ObjectId;
	targetKey: string;
	modifier: number;
}

/**
 * What a guard puts on the request after verifying the access token.
 * Deliberately small: anything else is read from the database when needed.
 */
export interface AuthMember {
	_id: ObjectId;
	memberType: MemberType;
	jti: string;
	iat: number;
	exp: number;
}
