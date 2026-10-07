import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { DoctorResolver } from './doctor.resolver';
import { DoctorService } from './doctor.service';
import { AuthModule } from '../auth/auth.module';
import { MemberModule } from '../member/member.module';
import { ClinicModule } from '../clinic/clinic.module';
import { LikeModule } from '../like/like.module';
import { ViewModule } from '../view/view.module';
import { FollowModule } from '../follow/follow.module';
import { AuditLogModule } from '../audit-log/audit-log.module';
import DoctorSchema from '../../schemas/Doctor.model';

/**
 * doctor → clinic, never the reverse. Clinic changes reach doctor pages through cache keys
 * (ClinicService drops `doctor:*` on every clinic change), not through an import.
 */
@Module({
	imports: [
		MongooseModule.forFeature([{ name: 'Doctor', schema: DoctorSchema }]),
		AuthModule,
		MemberModule,
		ClinicModule,
		LikeModule,
		ViewModule,
		FollowModule,
		AuditLogModule,
	],
	providers: [DoctorResolver, DoctorService],
	exports: [DoctorService],
})
export class DoctorModule {}
