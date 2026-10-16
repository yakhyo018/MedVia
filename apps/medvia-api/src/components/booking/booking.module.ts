import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BookingResolver } from './booking.resolver';
import { BookingService } from './booking.service';
import { SlotResolver } from './slot.resolver';
import { SlotService } from './slot.service';
import { AuthModule } from '../auth/auth.module';
import { ClinicModule } from '../clinic/clinic.module';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { ChatModule } from '../chat/chat.module';
import { AiModule } from '../ai/ai.module';
import SlotSchema from '../../schemas/Slot.model';
import BookingSchema from '../../schemas/Booking.model';
import TreatmentSchema from '../../schemas/Treatment.model';
import DoctorSchema from '../../schemas/Doctor.model';
import MemberSchema from '../../schemas/Member.model';
import { NotificationModule } from '../notification/notification.module';
import { BullModule } from '@nestjs/bullmq';
import { BOOKING_QUEUE, BookingJobs } from './booking.jobs';
import { BookingProcessor } from './booking.processor';
import { AccessLogModule } from '../access-log/access-log.module';

/**
 * booking → clinic, chat (the booking lines in the patient's room). The Treatment and Doctor
 * models, not their modules: DoctorModule imports this one (a doctor with upcoming bookings
 * cannot be removed), so the reverse would be a cycle.
 */
@Module({
	imports: [
		MongooseModule.forFeature([
			{ name: 'Slot', schema: SlotSchema },
			{ name: 'Booking', schema: BookingSchema },
			{ name: 'Treatment', schema: TreatmentSchema },
			{ name: 'Doctor', schema: DoctorSchema },
			{ name: 'Member', schema: MemberSchema },
		]),
		AuthModule,
		ClinicModule,
		AuditLogModule,
		ChatModule,
		AiModule,
		NotificationModule,
		AccessLogModule,
		BullModule.registerQueue({ name: BOOKING_QUEUE }),
	],
	providers: [
		SlotResolver,
		SlotService,
		BookingResolver,
		BookingService,
		BookingJobs,
		BookingProcessor,
	],
	exports: [BookingService, BookingJobs, SlotService],
})
export class BookingModule {}
