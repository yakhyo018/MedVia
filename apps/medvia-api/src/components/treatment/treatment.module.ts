import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { TreatmentResolver } from './treatment.resolver';
import { TreatmentService } from './treatment.service';
import { AuthModule } from '../auth/auth.module';
import { ClinicModule } from '../clinic/clinic.module';
import { AuditLogModule } from '../audit-log/audit-log.module';
import TreatmentSchema from '../../schemas/Treatment.model';
import DoctorSchema from '../../schemas/Doctor.model';

/**
 * treatment → clinic. The Doctor model, not DoctorModule: DoctorModule imports this module
 * (removing a doctor detaches it from treatments), so the reverse import would be a cycle.
 */
@Module({
	imports: [
		MongooseModule.forFeature([
			{ name: 'Treatment', schema: TreatmentSchema },
			{ name: 'Doctor', schema: DoctorSchema },
		]),
		AuthModule,
		ClinicModule,
		AuditLogModule,
	],
	providers: [TreatmentResolver, TreatmentService],
	exports: [TreatmentService],
})
export class TreatmentModule {}
