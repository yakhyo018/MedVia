import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ThrottlerModule } from '@nestjs/throttler';
import { ChatResolver } from './chat.resolver';
import { ChatService } from './chat.service';
import { AuthModule } from '../auth/auth.module';
import { ClinicModule } from '../clinic/clinic.module';
import { AiModule } from '../ai/ai.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { NotificationModule } from '../notification/notification.module';
import ChatRoomSchema from '../../schemas/ChatRoom.model';
import ChatMessageSchema from '../../schemas/ChatMessage.model';
import MemberSchema from '../../schemas/Member.model';

/**
 * chat → clinic, ai, realtime (the socket), notification (the bell). The booking module imports this one to post its lines, so chat never imports
 * booking. The Member model is read for the patient's language and name only.
 */
@Module({
	imports: [
		MongooseModule.forFeature([
			{ name: 'ChatRoom', schema: ChatRoomSchema },
			{ name: 'ChatMessage', schema: ChatMessageSchema },
			{ name: 'Member', schema: MemberSchema },
		]),
		ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 20 }]),
		AuthModule,
		ClinicModule,
		AiModule,
		RealtimeModule,
		NotificationModule,
	],
	providers: [ChatResolver, ChatService],
	exports: [ChatService],
})
export class ChatModule {}
