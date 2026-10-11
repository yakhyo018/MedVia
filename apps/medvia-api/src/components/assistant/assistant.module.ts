import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AssistantResolver } from './assistant.resolver';
import { AssistantService } from './assistant.service';
import { AssistantTools } from './assistant.tools';
import { AuthModule } from '../auth/auth.module';
import { AiModule } from '../ai/ai.module';
import { ClinicModule } from '../clinic/clinic.module';
import { TreatmentModule } from '../treatment/treatment.module';
import { BookingModule } from '../booking/booking.module';
import { ReviewModule } from '../review/review.module';
import AssistantSessionSchema from '../../schemas/AssistantSession.model';
import MemberSchema from '../../schemas/Member.model';
import TreatmentSchema from '../../schemas/Treatment.model';

/**
 * assistant → ai, clinic, treatment, booking, review — the services it calls as tools. Nothing
 * imports it back. The Member model: the language and the AI consent; Treatment: its doctors.
 */
@Module({
	imports: [
		MongooseModule.forFeature([
			{ name: 'AssistantSession', schema: AssistantSessionSchema },
			{ name: 'Member', schema: MemberSchema },
			{ name: 'Treatment', schema: TreatmentSchema },
		]),
		AuthModule,
		AiModule,
		ClinicModule,
		TreatmentModule,
		BookingModule,
		ReviewModule,
	],
	providers: [AssistantResolver, AssistantService, AssistantTools],
})
export class AssistantModule {}
