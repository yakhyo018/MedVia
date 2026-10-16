import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ReportResolver } from './report.resolver';
import { ReportService } from './report.service';
import { AuthModule } from '../auth/auth.module';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { BoardArticleModule } from '../board-article/board-article.module';
import { CommentModule } from '../comment/comment.module';
import ReportSchema from '../../schemas/Report.model';

/** report → board-article, comment, audit-log. */
@Module({
	imports: [
		MongooseModule.forFeature([{ name: 'Report', schema: ReportSchema }]),
		AuthModule,
		AuditLogModule,
		BoardArticleModule,
		CommentModule,
	],
	providers: [ReportResolver, ReportService],
})
export class ReportModule {}
