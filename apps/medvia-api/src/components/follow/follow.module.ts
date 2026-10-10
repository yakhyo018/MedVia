import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { FollowService } from './follow.service';
import { FollowResolver } from './follow.resolver';
import { AuthModule } from '../auth/auth.module';
import { NotificationModule } from '../notification/notification.module';
import FollowSchema from '../../schemas/Follow.model';
import MemberSchema from '../../schemas/Member.model';
import ClinicSchema from '../../schemas/Clinic.model';
import DoctorSchema from '../../schemas/Doctor.model';

@Module({
	imports: [
		MongooseModule.forFeature([
			{ name: 'Follow', schema: FollowSchema },
			// Models, not Member/Clinic/DoctorModule: Clinic and Doctor modules import this one,
			// so importing it back would close a cycle.
			{ name: 'Member', schema: MemberSchema },
			{ name: 'Clinic', schema: ClinicSchema },
			{ name: 'Doctor', schema: DoctorSchema },
		]),
		AuthModule,
		// follow → notification → realtime: none of them imports follow back.
		NotificationModule,
	],
	providers: [FollowService, FollowResolver],
	exports: [FollowService],
})
export class FollowModule {}
