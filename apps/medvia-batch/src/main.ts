import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { BatchModule } from './batch.module';

async function bootstrap() {
	const app = await NestFactory.create(BatchModule);

	// Lets running jobs and connections close cleanly on SIGTERM (BullMQ workers in M9).
	app.enableShutdownHooks();

	const port = process.env.PORT_BATCH ?? 3001;
	await app.listen(port);
	console.log(`MedVia BATCH is running on http://localhost:${port}`);
}
void bootstrap();
