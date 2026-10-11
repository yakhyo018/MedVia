import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ThrottlerModule } from '@nestjs/throttler';
import { MemberResolver } from './member.resolver';
import { MemberService } from './member.service';
import { AuthModule } from '../auth/auth.module';
import { AuditLogModule } from '../audit-log/audit-log.module';
import MemberSchema from '../../schemas/Member.model';
import BookingSchema from '../../schemas/Booking.model';
import BoardArticleSchema from '../../schemas/BoardArticle.model';
import CommentSchema from '../../schemas/Comment.model';
import ReportSchema from '../../schemas/Report.model';

@Module({
	imports: [
		MongooseModule.forFeature([
			{ name: 'Member', schema: MemberSchema },
			// The admin's user detail reads these; see MemberService.
			{ name: 'Booking', schema: BookingSchema },
			{ name: 'BoardArticle', schema: BoardArticleSchema },
			{ name: 'Comment', schema: CommentSchema },
			{ name: 'Report', schema: ReportSchema },
		]),
		// In-memory counters: correct for one API process. Several processes would each
		// count separately, and the limit would multiply — then the store moves to Redis.
		ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 10 }]),
		AuthModule,
		AuditLogModule,
	],
	providers: [MemberResolver, MemberService],
	exports: [MemberService],
})
export class MemberModule {}
