import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { MemberModule } from './member/member.module';
import { ClinicModule } from './clinic/clinic.module';
import { FollowModule } from './follow/follow.module';
import { AuditLogModule } from './audit-log/audit-log.module';
import { UploadModule } from './upload/upload.module';
import { DoctorModule } from './doctor/doctor.module';
import { TreatmentModule } from './treatment/treatment.module';
import { ViewModule } from './view/view.module';
import { BookingModule } from './booking/booking.module';
import { ReviewModule } from './review/review.module';
import { ChatModule } from './chat/chat.module';
import { BoardArticleModule } from './board-article/board-article.module';
import { CommentModule } from './comment/comment.module';
import { ReportModule } from './report/report.module';
import { NoticeModule } from './notice/notice.module';
import { InquiryModule } from './inquiry/inquiry.module';
import { TestSupportModule, testSupportEnabled } from './test-support/test-support.module';

@Module({
	imports: [
		AuthModule,
		MemberModule,
		ClinicModule,
		DoctorModule,
		TreatmentModule,
		BookingModule,
		ReviewModule,
		ChatModule,
		BoardArticleModule,
		CommentModule,
		ReportModule,
		NoticeModule,
		InquiryModule,
		FollowModule,
		ViewModule,
		AuditLogModule,
		UploadModule,
		// Postman "time travel" — never registered in production (see TestSupportModule).
		...(testSupportEnabled() ? [TestSupportModule] : []),
	],
})
export class ComponentsModule {}
