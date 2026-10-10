import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { InquiryResolver } from './inquiry.resolver';
import { InquiryService } from './inquiry.service';
import { AuthModule } from '../auth/auth.module';
import { BookingModule } from '../booking/booking.module';
import InquirySchema from '../../schemas/Inquiry.model';

/** inquiry → booking (a related booking must be the patient's own). */
@Module({
	imports: [
		MongooseModule.forFeature([{ name: 'Inquiry', schema: InquirySchema }]),
		AuthModule,
		BookingModule,
	],
	providers: [InquiryResolver, InquiryService],
	exports: [InquiryService],
})
export class InquiryModule {}
