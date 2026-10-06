import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { LoggingInterceptor } from './libs/interceptor/Logging.interceptor';

async function bootstrap() {
	const app = await NestFactory.create(AppModule);

	// Without this, onModuleDestroy / onApplicationShutdown never run on Ctrl+C or a
	// container's SIGTERM, so connections are cut instead of closed.
	app.enableShutdownHooks();

	app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
	app.useGlobalInterceptors(new LoggingInterceptor());
	app.enableCors({ origin: true, credentials: true });

	const port = process.env.PORT_API ?? 3000;
	await app.listen(port);
	console.log(`MedVia API is running on http://localhost:${port}/graphql`);
}
void bootstrap();
