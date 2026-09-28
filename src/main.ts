// IMPORTANT: Make sure to import `instrument.ts` at the top of your file.
// If you're using CommonJS (CJS) syntax, use `require("./instrument.ts");`
import './instrument';

// All other imports below
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { json, urlencoded } from 'express';
// Initialize OpenTelemetry tracing (SigNoz) before NestJS app bootstrap
import { shutdownTracing, startTracing } from './tracing';
import { AppModule } from './app.module';

async function bootstrap() {
  await startTracing();

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
  });
  const configService = app.get(ConfigService);

  // Trust private/loopback reverse proxies so req.ip is derived safely from
  // X-Forwarded-For when traffic arrives through the nginx ingress.
  app.set('trust proxy', ['loopback', 'linklocal', 'uniquelocal']);

  // Allow larger payloads only for email send requests while keeping the default limit elsewhere.
  app.use(
    '/admin/v2/:location/email/send',
    json({ limit: '10mb' }),
    urlencoded({ extended: true, limit: '10mb' }),
  );
  app.use(
    '/public/v2/:location/enrollments/:token/submissions',
    json({ limit: '2mb' }),
    urlencoded({ extended: true, limit: '2mb' }),
  );
  app.use(json({ limit: '1mb' }));
  app.use(urlencoded({ extended: true, limit: '1mb' }));

  // CORS not needed - using reverse proxy (nginx) for routing
  // Check for development environments
  const isDevelopment = process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'dev';

  if (isDevelopment) {
    app.enableCors({
      origin: true, // Allow all origins in development
      credentials: true, // Allow credentials (cookies, authorization headers)
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      allowedHeaders: [
        'Origin',
        'X-Requested-With',
        'Content-Type',
        'Accept',
        'Authorization',
        'Cache-Control',
        'X-Forwarded-For',
        'X-Forwarded-Proto',
        'X-Forwarded-Host',
      ],
      exposedHeaders: ['Content-Length', 'X-Total-Count'],
    });
  } else {
    app.enableCors({
      origin: process.env.BASE_URL?.replace(/\/$/, ''),
      credentials: true,
    });
  }

  // Ensure Nest shuts down on signals so ports are released cleanly
  app.enableShutdownHooks();

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const port = configService.get<string | number>('port') ?? 3000;
  await app.listen(port);

  // Flush tracing when Nest triggers its built-in shutdown hooks.
  app.getHttpServer().on('close', async () => {
    await shutdownTracing();
  });

  console.log(`🚀 Application is running on: http://localhost:${port}`);
  console.log(`🏥 Health check available at: http://localhost:${port}/health`);
}
void bootstrap();
