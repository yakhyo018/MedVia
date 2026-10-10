import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { NoticeResolver } from './notice.resolver';
import { NoticeService } from './notice.service';
import { AuthModule } from '../auth/auth.module';
import NoticeSchema from '../../schemas/Notice.model';
import MemberSchema from '../../schemas/Member.model';

/** The Member model is read for the reader's language only. */
@Module({
	imports: [
		MongooseModule.forFeature([
			{ name: 'Notice', schema: NoticeSchema },
			{ name: 'Member', schema: MemberSchema },
		]),
		AuthModule,
	],
	providers: [NoticeResolver, NoticeService],
})
export class NoticeModule {}
