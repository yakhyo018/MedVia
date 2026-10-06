import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
	public getHello(): string {
		return 'Welcome to the MedVia API server!';
	}
}
