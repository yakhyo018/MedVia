import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthService } from './auth.service';
import { SessionService } from './session.service';
import { GoogleService } from './google.service';
import SessionSchema from '../../schemas/Session.model';

@Module({
	imports: [
		JwtModule.register({ secret: `${process.env.SECRET_TOKEN}` }),
		MongooseModule.forFeature([{ name: 'Session', schema: SessionSchema }]),
	],
	providers: [AuthService, SessionService, GoogleService],
	exports: [AuthService, SessionService, GoogleService],
})
export class AuthModule {}
