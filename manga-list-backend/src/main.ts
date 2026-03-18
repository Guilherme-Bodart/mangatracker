import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import { Request, Response, NextFunction } from 'express';
import { AppModule } from './app.module';
import { ApiExceptionFilter } from './common/filters/api-exception.filter';
import { requestTraceMiddleware } from './common/middleware/request-trace.middleware';

async function bootstrap() {
  validateProductionConfig();
  const nodeEnv = process.env.NODE_ENV ?? 'development';
  const isProduction = nodeEnv === 'production';

  const app = await NestFactory.create(AppModule);
  const expressApp = app.getHttpAdapter().getInstance();

  expressApp.set(
    'trust proxy',
    parseTrustProxySetting(process.env.TRUST_PROXY),
  );

  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      hsts: isProduction
        ? {
            maxAge: 31536000,
            includeSubDomains: true,
            preload: true,
          }
        : false,
    }),
  );
  if (isProduction) {
    app.use(enforceHttpsForAllRoutes);
  }
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
  const extensionOrigins = Array.from(
    new Set(
      (process.env.EXTENSION_ORIGINS || '')
        .split(',')
        .map((origin) => normalizeOrigin(origin.trim()))
        .filter((origin): origin is string => !!origin),
    ),
  );
  const allowAnyExtensionOrigin =
    process.env.ALLOW_ANY_EXTENSION_ORIGIN === 'true';

  // Enable CORS for frontend and extension origins
  app.enableCors({
    origin: (origin, callback) => {
      if (!origin) {
        callback(null, true);
        return;
      }

      const normalizedOrigin = normalizeOrigin(origin);
      if (!normalizedOrigin) {
        callback(null, false);
        return;
      }

      const isExtensionOrigin =
        normalizedOrigin.startsWith('chrome-extension://') ||
        normalizedOrigin.startsWith('moz-extension://');
      const isAllowed =
        frontendOrigins.includes(normalizedOrigin) ||
        extensionOrigins.includes(normalizedOrigin) ||
        (allowAnyExtensionOrigin && isExtensionOrigin);

      callback(null, isAllowed);
    },
    credentials: true,
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'Accept',
      'Accept-Language',
      'Accept-Encoding',
      'x-csrf-token',
      'x-idempotency-key',
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
  const logger = new Logger('Bootstrap');
  logger.log(`Backend running on http://localhost:${port}`);
}

function validateProductionConfig(): void {
  const nodeEnv = process.env.NODE_ENV ?? 'development';
  if (nodeEnv !== 'production') {
    return;
  }

  const errors: string[] = [];
  const cookieSecure = process.env.COOKIE_SECURE === 'true';
  const cookieSameSite = (process.env.COOKIE_SAMESITE ?? 'lax').toLowerCase();
  const cookiePartitioned = process.env.COOKIE_PARTITIONED === 'true';
  const resetDevResponse = process.env.PASSWORD_RESET_DEV_RESPONSE === 'true';
  const hashRounds = parseHashRounds(process.env.PASSWORD_HASH_ROUNDS);
  const frontendUrls = (
    process.env.FRONTEND_URLS ||
    process.env.FRONTEND_URL ||
    ''
  )
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);

  if (!cookieSecure) {
    errors.push('COOKIE_SECURE must be true in production');
  }

  if (!['lax', 'strict', 'none'].includes(cookieSameSite)) {
    errors.push('COOKIE_SAMESITE must be one of: lax, strict, none');
  }

  if (cookieSameSite === 'none' && !cookieSecure) {
    errors.push('COOKIE_SAMESITE=none requires COOKIE_SECURE=true');
  }

  if (cookiePartitioned && cookieSameSite !== 'none') {
    errors.push('COOKIE_PARTITIONED=true requires COOKIE_SAMESITE=none');
  }

  if (cookiePartitioned && !cookieSecure) {
    errors.push('COOKIE_PARTITIONED=true requires COOKIE_SECURE=true');
  }

  if (resetDevResponse) {
    errors.push('PASSWORD_RESET_DEV_RESPONSE must be false in production');
  }

  if (hashRounds < 12) {
    errors.push('PASSWORD_HASH_ROUNDS must be >= 12 in production');
  }

  if (
    frontendUrls.length > 0 &&
    frontendUrls.some((origin) => !origin.toLowerCase().startsWith('https://'))
  ) {
    errors.push('FRONTEND_URL/FRONTEND_URLS must use https in production');
  }

  if (errors.length > 0) {
    throw new Error(
      `Invalid production configuration:\n- ${errors.join('\n- ')}`,
    );
  }
}

function normalizeOrigin(origin: string): string | null {
  if (!origin) return null;
  const trimmed = origin.trim();
  if (
    trimmed.toLowerCase().startsWith('chrome-extension://') ||
    trimmed.toLowerCase().startsWith('moz-extension://')
  ) {
    return trimmed.replace(/\/+$/, '').toLowerCase();
  }
  try {
    const parsed = new URL(trimmed);
    return parsed.origin;
  } catch {
    return null;
  }
}

function parseTrustProxySetting(
  value: string | undefined,
): boolean | number | string {
  const normalized = value?.trim();
  if (!normalized) {
    return false;
  }

  const lower = normalized.toLowerCase();
  if (lower === 'false' || lower === '0') {
    return false;
  }

  if (lower === 'true') {
    return 1;
  }

  const asNumber = Number.parseInt(normalized, 10);
  if (!Number.isNaN(asNumber) && asNumber >= 0) {
    return asNumber;
  }

  return normalized;
}

function parseHashRounds(value: string | undefined): number {
  const fallback = 12;
  if (!value?.trim()) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 4) {
    return fallback;
  }

  return parsed;
}

function enforceHttpsForAllRoutes(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (isHttpsRequest(req)) {
    next();
    return;
  }

  res.status(426).json({
    code: 'HTTPS_REQUIRED',
    message: 'HTTPS is required in production',
  });
}

function isHttpsRequest(req: Request): boolean {
  return req.secure || req.protocol === 'https';
}

bootstrap();
