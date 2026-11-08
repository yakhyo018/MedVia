import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { AiModule } from '../ai/ai.module';
import FaceScanSchema from '../../schemas/FaceScan.model';
import MemberSchema from '../../schemas/Member.model';
import { FaceScanController } from './face-scan.controller';
import { FaceScanResolver } from './face-scan.resolver';
import { FaceScanService } from './face-scan.service';

/** face-scan → ai. Nothing imports it back. The Member model: the language and the AI consent. */
@Module({
	imports: [
		MongooseModule.forFeature([
			{ name: 'FaceScan', schema: FaceScanSchema },
			{ name: 'Member', schema: MemberSchema },
		]),
		AuthModule,
		AiModule,
	],
	controllers: [FaceScanController],
	providers: [FaceScanResolver, FaceScanService],
})
export class FaceScanModule {}
