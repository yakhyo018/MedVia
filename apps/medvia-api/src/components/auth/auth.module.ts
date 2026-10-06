import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthService } from './auth.service';
import { TokenService } from './token.service';
import { SessionService } from './session.service';
import { GoogleService } from './google.service';
import SessionSchema from '../../schemas/Session.model';
import MemberSchema from '../../schemas/Member.model';

@Module({
	imports: [
		JwtModule.register({ secret: `${process.env.SECRET_TOKEN}` }),
		MongooseModule.forFeature([
			{ name: 'Session', schema: SessionSchema },
			// Only to re-check a member's status on refresh — the model, not MemberModule,
			// so the dependency stays one-way: member → auth.
			{ name: 'Member', schema: MemberSchema },
		]),
	],
	providers: [AuthService, TokenService, SessionService, GoogleService],
	// SessionService is not exported: refresh sessions are an internal detail of this module.
	// TokenService is, because the guards run inside every module that uses them.
	exports: [AuthService, TokenService, GoogleService],
})
export class AuthModule {}
