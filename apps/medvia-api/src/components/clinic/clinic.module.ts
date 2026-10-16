import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ClinicResolver } from './clinic.resolver';
import { ClinicService } from './clinic.service';
import { AuthModule } from '../auth/auth.module';
import { MemberModule } from '../member/member.module';
import { LikeModule } from '../like/like.module';
import { ViewModule } from '../view/view.module';
import { FollowModule } from '../follow/follow.module';
import { AuditLogModule } from '../audit-log/audit-log.module';
import ClinicSchema from '../../schemas/Clinic.model';

@Module({
	imports: [
		MongooseModule.forFeature([{ name: 'Clinic', schema: ClinicSchema }]),
		AuthModule,
		MemberModule,
		LikeModule,
		ViewModule,
		FollowModule,
		AuditLogModule,
	],
	providers: [ClinicResolver, ClinicService],
	exports: [ClinicService],
})
export class ClinicModule {}
