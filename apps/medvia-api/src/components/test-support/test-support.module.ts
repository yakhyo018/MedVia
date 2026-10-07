import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { TestSupportResolver } from './test-support.resolver';
import { AuthModule } from '../auth/auth.module';
import BookingSchema from '../../schemas/Booking.model';
import SlotSchema from '../../schemas/Slot.model';

/**
 * Helpers for the Postman suite that the real flow cannot provide — today only "time travel"
 * for a booking. Imported by ComponentsModule only when testSupportEnabled() is true, so in
 * production the mutation does not exist in the GraphQL schema at all.
 */
@Module({
	imports: [
		MongooseModule.forFeature([
			{ name: 'Booking', schema: BookingSchema },
			{ name: 'Slot', schema: SlotSchema },
		]),
		AuthModule,
	],
	providers: [TestSupportResolver],
})
export class TestSupportModule {}

/** Two locks: an explicit flag, and never in production even if the flag leaks there. */
export const testSupportEnabled = (): boolean =>
	process.env.NODE_ENV !== 'production' && process.env.ENABLE_TEST_SUPPORT === 'true';
