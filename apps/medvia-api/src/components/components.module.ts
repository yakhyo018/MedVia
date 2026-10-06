import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { MemberModule } from './member/member.module';
import { ClinicModule } from './clinic/clinic.module';
import { FollowModule } from './follow/follow.module';
import { AuditLogModule } from './audit-log/audit-log.module';
import { UploadModule } from './upload/upload.module';

@Module({
	imports: [AuthModule, MemberModule, ClinicModule, FollowModule, AuditLogModule, UploadModule],
})
export class ComponentsModule {}
