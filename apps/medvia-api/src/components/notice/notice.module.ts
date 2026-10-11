import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { NoticeResolver } from './notice.resolver';
import { NoticeService } from './notice.service';
import { AuthModule } from '../auth/auth.module';
import { AuditLogModule } from '../audit-log/audit-log.module';
import NoticeSchema from '../../schemas/Notice.model';
import MemberSchema from '../../schemas/Member.model';

/** notice → audit-log (publishing is a decision). The Member model: the reader's language. */
@Module({
	imports: [
		MongooseModule.forFeature([
			{ name: 'Notice', schema: NoticeSchema },
			{ name: 'Member', schema: MemberSchema },
		]),
		AuthModule,
		AuditLogModule,
	],
	providers: [NoticeResolver, NoticeService],
})
export class NoticeModule {}
