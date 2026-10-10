import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { RealtimeGateway } from './realtime.gateway';
import { AuthModule } from '../auth/auth.module';
import ClinicSchema from '../../schemas/Clinic.model';

/**
 * realtime → auth only. Chat and notifications import this module; it imports neither, and it
 * reads the Clinic model instead of ClinicModule (clinic → follow → notification → realtime
 * would be a cycle).
 */
@Module({
	imports: [MongooseModule.forFeature([{ name: 'Clinic', schema: ClinicSchema }]), AuthModule],
	providers: [RealtimeGateway],
	exports: [RealtimeGateway],
})
export class RealtimeModule {}
