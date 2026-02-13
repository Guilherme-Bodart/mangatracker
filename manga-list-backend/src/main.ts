import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { ApiExceptionFilter } from './common/filters/api-exception.filter';
import { requestTraceMiddleware } from './common/middleware/request-trace.middleware';

async function bootstrap() {
  validateProductionConfig();

  const app = await NestFactory.create(AppModule);
  const expressApp = app.getHttpAdapter().getInstance();

  const trustProxy = process.env.TRUST_PROXY;
  if (trustProxy) {
    expressApp.set('trust proxy', trustProxy === 'true' ? 1 : trustProxy);
  }

  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );
  app.use(requestTraceMiddleware);
  expressApp.disable('x-powered-by');

  const frontendOrigins = Array.from(
    new Set(
      (
        process.env.FRONTEND_URLS ||
        process.env.FRONTEND_URL ||
        'http://localhost:3000'
      )
        .split(',')
        .map((origin) => normalizeOrigin(origin.trim()))
        .filter((origin): origin is string => !!origin),
    ),
  );

  // Enable CORS for frontend
  app.enableCors({
    origin: frontendOrigins,
    credentials: true,
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'Accept',
      'Accept-Language',
      'Accept-Encoding',
      'x-csrf-token',
    ],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  // Enable global validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );
  app.useGlobalFilters(new ApiExceptionFilter());

  const port = process.env.PORT || 3001;
  await app.listen(port);
  console.log(`🚀 Backend running on http://localhost:${port}`);
}

function validateProductionConfig(): void {
  const nodeEnv = process.env.NODE_ENV ?? 'development';
  if (nodeEnv !== 'production') {
    return;
  }

  const errors: string[] = [];
  const cookieSecure = process.env.COOKIE_SECURE === 'true';
  const cookieSameSite = (process.env.COOKIE_SAMESITE ?? 'lax').toLowerCase();
  const resetDevResponse = process.env.PASSWORD_RESET_DEV_RESPONSE === 'true';

  if (!cookieSecure) {
    errors.push('COOKIE_SECURE must be true in production');
  }

  if (!['lax', 'strict', 'none'].includes(cookieSameSite)) {
    errors.push('COOKIE_SAMESITE must be one of: lax, strict, none');
  }

  if (cookieSameSite === 'none' && !cookieSecure) {
    errors.push('COOKIE_SAMESITE=none requires COOKIE_SECURE=true');
  }

  if (resetDevResponse) {
    errors.push('PASSWORD_RESET_DEV_RESPONSE must be false in production');
  }

  if (errors.length > 0) {
    throw new Error(
      `Invalid production configuration:\n- ${errors.join('\n- ')}`,
    );
  }
}

function normalizeOrigin(origin: string): string | null {
  if (!origin) return null;
  try {
    const parsed = new URL(origin);
    return parsed.origin;
  } catch {
    return null;
  }
}

bootstrap();
