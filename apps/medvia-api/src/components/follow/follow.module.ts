import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { FollowService } from './follow.service';
import { FollowResolver } from './follow.resolver';
import { AuthModule } from '../auth/auth.module';
import FollowSchema from '../../schemas/Follow.model';
import MemberSchema from '../../schemas/Member.model';
import ClinicSchema from '../../schemas/Clinic.model';

@Module({
	imports: [
		MongooseModule.forFeature([
			{ name: 'Follow', schema: FollowSchema },
			// Models, not MemberModule / ClinicModule: ClinicModule imports this one,
			// so importing it back would close a cycle.
			{ name: 'Member', schema: MemberSchema },
			{ name: 'Clinic', schema: ClinicSchema },
		]),
		AuthModule,
	],
	providers: [FollowService, FollowResolver],
	exports: [FollowService],
})
export class FollowModule {}
