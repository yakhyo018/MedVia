import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { LoggingInterceptor } from './libs/interceptor/Logging.interceptor';

async function bootstrap() {
	const app = await NestFactory.create<NestExpressApplication>(AppModule);

	// Without this, onModuleDestroy / onApplicationShutdown never run on Ctrl+C or a
	// container's SIGTERM, so connections are cut instead of closed.
	app.enableShutdownHooks();

	// Behind Nginx every request arrives from 127.0.0.1. Trusting the first proxy makes
	// req.ip the real client again — otherwise the login throttle would count all users as one.
	if (process.env.NODE_ENV === 'production') app.set('trust proxy', 1);

	app.use(cookieParser());
	app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
	app.useGlobalInterceptors(new LoggingInterceptor());

	// Uploaded images are public files: clinic photos and avatars, nothing private.
	app.useStaticAssets('uploads', { prefix: '/uploads' });

	// Only our frontend may send credentialed requests. Nestar's `origin: true` reflected
	// any origin back, harmless without cookies — with a refresh cookie it would let any
	// website call the API as the signed-in user and read the answer.
	const origins = (process.env.FRONTEND_URL ?? 'http://localhost:4000')
		.split(',')
		.map((o) => o.trim());
	app.enableCors({ origin: origins, credentials: true });

	const port = process.env.PORT_API ?? 3000;
	await app.listen(port);
	console.log(`MedVia API is running on http://localhost:${port}/graphql`);
}
void bootstrap();
