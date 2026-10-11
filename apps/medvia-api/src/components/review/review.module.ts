import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ReviewResolver } from './review.resolver';
import { ReviewService } from './review.service';
import { AuthModule } from '../auth/auth.module';
import { BookingModule } from '../booking/booking.module';
import { ClinicModule } from '../clinic/clinic.module';
import { DoctorModule } from '../doctor/doctor.module';
import { AuditLogModule } from '../audit-log/audit-log.module';
import ReviewSchema from '../../schemas/Review.model';
import DoctorSchema from '../../schemas/Doctor.model';

/** review → booking, clinic, doctor. None of them imports this module, so there is no cycle. */
@Module({
	imports: [
		MongooseModule.forFeature([
			{ name: 'Review', schema: ReviewSchema },
			{ name: 'Doctor', schema: DoctorSchema },
		]),
		AuthModule,
		BookingModule,
		ClinicModule,
		DoctorModule,
		AuditLogModule,
	],
	providers: [ReviewResolver, ReviewService],
	// The booking assistant (AI-2) reads published reviews through it.
	exports: [ReviewService],
})
export class ReviewModule {}
