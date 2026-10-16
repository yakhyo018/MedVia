import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CommentResolver } from './comment.resolver';
import { CommentService } from './comment.service';
import { AuthModule } from '../auth/auth.module';
import { BoardArticleModule } from '../board-article/board-article.module';
import { NotificationModule } from '../notification/notification.module';
import CommentSchema from '../../schemas/Comment.model';

/** comment → board-article, notification. Report imports this module, never the reverse. */
@Module({
	imports: [
		MongooseModule.forFeature([{ name: 'Comment', schema: CommentSchema }]),
		AuthModule,
		BoardArticleModule,
		NotificationModule,
	],
	providers: [CommentResolver, CommentService],
	exports: [CommentService],
})
export class CommentModule {}
