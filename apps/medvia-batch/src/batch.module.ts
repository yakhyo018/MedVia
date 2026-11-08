import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { ScheduleModule } from '@nestjs/schedule';
import { BatchController } from './batch.controller';
import { BatchService } from './batch.service';
import { BatchLogService } from './batch-log.service';
import { BatchCacheService } from './batch-cache.service';
import { SlotReleaseService } from './jobs/slot-release.service';
import { RecountService } from './jobs/recount.service';
import { RankService } from './jobs/rank.service';
import { NaviSyncService } from './jobs/navi-sync.service';
import { DatabaseModule } from './database/database.module';
import { envValidationSchema } from '../../medvia-api/src/libs/utils/env.validation';
import BatchLogSchema from '../../medvia-api/src/schemas/BatchLog.model';
import BoardArticleSchema from '../../medvia-api/src/schemas/BoardArticle.model';
import BookingSchema from '../../medvia-api/src/schemas/Booking.model';
import ClinicSchema from '../../medvia-api/src/schemas/Clinic.model';
import DoctorSchema from '../../medvia-api/src/schemas/Doctor.model';
import FollowSchema from '../../medvia-api/src/schemas/Follow.model';
import MemberSchema from '../../medvia-api/src/schemas/Member.model';
import NoticeSchema from '../../medvia-api/src/schemas/Notice.model';
import ReviewSchema from '../../medvia-api/src/schemas/Review.model';
import SlotSchema from '../../medvia-api/src/schemas/Slot.model';
import TreatmentSchema from '../../medvia-api/src/schemas/Treatment.model';

/** The API's schemas, one source: the batch reads and writes the same collections. */
@Module({
	imports: [
		ConfigModule.forRoot({ isGlobal: true, validationSchema: envValidationSchema }),
		ScheduleModule.forRoot(),
		DatabaseModule,
		MongooseModule.forFeature([
			{ name: 'BatchLog', schema: BatchLogSchema },
			{ name: 'BoardArticle', schema: BoardArticleSchema },
			{ name: 'Booking', schema: BookingSchema },
			{ name: 'Clinic', schema: ClinicSchema },
			{ name: 'Doctor', schema: DoctorSchema },
			{ name: 'Follow', schema: FollowSchema },
			{ name: 'Member', schema: MemberSchema },
			{ name: 'Notice', schema: NoticeSchema },
			{ name: 'Review', schema: ReviewSchema },
			{ name: 'Slot', schema: SlotSchema },
			{ name: 'Treatment', schema: TreatmentSchema },
		]),
	],
	controllers: [BatchController],
	providers: [
		BatchService,
		BatchLogService,
		BatchCacheService,
		SlotReleaseService,
		RecountService,
		RankService,
		NaviSyncService,
	],
})
export class BatchModule {}
