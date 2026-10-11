import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { TestSupportResolver } from './test-support.resolver';
import { AuthModule } from '../auth/auth.module';
import BookingSchema from '../../schemas/Booking.model';
import SlotSchema from '../../schemas/Slot.model';
import ClinicSchema from '../../schemas/Clinic.model';
import { BookingModule } from '../booking/booking.module';

/**
 * Helpers for the Postman suite that the real flow cannot provide: "time travel" for a
 * booking, running a queue job now, and a clinic whose counters drifted. Imported by
 * ComponentsModule only when testSupportEnabled() is true, so in production these mutations
 * do not exist in the GraphQL schema at all.
 */
@Module({
	imports: [
		MongooseModule.forFeature([
			{ name: 'Booking', schema: BookingSchema },
			{ name: 'Slot', schema: SlotSchema },
			{ name: 'Clinic', schema: ClinicSchema },
		]),
		AuthModule,
		BookingModule,
	],
	providers: [TestSupportResolver],
})
export class TestSupportModule {}
