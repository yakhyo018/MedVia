import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { NotificationResolver } from './notification.resolver';
import { NotificationService } from './notification.service';
import { AuthModule } from '../auth/auth.module';
import { RealtimeModule } from '../realtime/realtime.module';
import NotificationSchema from '../../schemas/Notification.model';
import MemberSchema from '../../schemas/Member.model';

/**
 * notification → realtime, auth. Booking, chat, follow, comment and inquiry import this module;
 * it imports none of them. The Member model is read for the receiver's switches only.
 */
@Module({
	imports: [
		MongooseModule.forFeature([
			{ name: 'Notification', schema: NotificationSchema },
			{ name: 'Member', schema: MemberSchema },
		]),
		AuthModule,
		RealtimeModule,
	],
	providers: [NotificationResolver, NotificationService],
	exports: [NotificationService],
})
export class NotificationModule {}
