import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { BatchModule } from './batch.module';

async function bootstrap() {
	const app = await NestFactory.create(BatchModule);

	// Lets a running batch finish its writes and Redis / Mongo close cleanly on SIGTERM.
	app.enableShutdownHooks();

	const port = process.env.PORT_BATCH ?? 3001;
	await app.listen(port);
	console.log(`MedVia BATCH is running on http://localhost:${port}`);
}
void bootstrap();
