import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import TreatmentSchema from '../../schemas/Treatment.model';
import { NaviResolver } from './navi.resolver';
import { NaviService } from './navi.service';

/** navi → Navi (HTTP). The Treatment model: a treatment source links to its clinic's page. */
@Module({
	imports: [
		MongooseModule.forFeature([{ name: 'Treatment', schema: TreatmentSchema }]),
		AuthModule,
	],
	providers: [NaviResolver, NaviService],
})
export class NaviModule {}
