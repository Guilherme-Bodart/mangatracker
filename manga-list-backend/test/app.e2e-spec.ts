import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from './../src/app.module';
import { ApiExceptionFilter } from '../src/common/filters/api-exception.filter';
import { requestTraceMiddleware } from '../src/common/middleware/request-trace.middleware';
import { resetHttpMetricsForTests } from '../src/observability/http-metrics.registry';
import { resetIntegrationMetricsForTests } from '../src/observability/integration-metrics.registry';

describe('AppController (e2e)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    resetHttpMetricsForTests();
    resetIntegrationMetricsForTests();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.use(requestTraceMiddleware);
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );
    app.useGlobalFilters(new ApiExceptionFilter());
    await app.init();
  });

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  it('/auth/me (GET) should return standardized error payload', async () => {
    const traceId = 'trace-e2e-1';
    const response = await request(app.getHttpServer())
      .get('/auth/me')
      .set('x-trace-id', traceId)
      .expect(401);

    expect(response.body).toEqual(
      expect.objectContaining({
        code: 'UNAUTHORIZED',
        message: 'Unauthorized',
        path: '/auth/me',
        traceId,
      }),
    );
    expect(response.headers['x-trace-id']).toBe(traceId);
    expect(response.body.timestamp).toBeDefined();
  });

  it('/auth/me (GET) should return translated error payload for pt-BR', async () => {
    const response = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Accept-Language', 'pt-BR,pt;q=0.9')
      .expect(401);

    expect(response.body).toEqual(
      expect.objectContaining({
        code: 'UNAUTHORIZED',
        message: 'Não autorizado',
        path: '/auth/me',
      }),
    );
  });

  it('/manga/search (GET) should reject invalid query params with standardized payload', async () => {
    const response = await request(app.getHttpServer())
      .get('/manga/search?q=naruto&page=abc&allowNsfw=not-a-bool')
      .expect(400);

    expect(response.body).toEqual(
      expect.objectContaining({
        code: 'BAD_REQUEST',
        message: 'Validation failed',
      }),
    );
    expect(response.body.path).toContain('/manga/search');
    expect(response.body.details?.validationErrors).toBeDefined();
  });

  it('/health (GET) should return service health', async () => {
    const response = await request(app.getHttpServer())
      .get('/health')
      .expect(200);

    expect(response.body).toEqual(
      expect.objectContaining({
        status: 'ok',
      }),
    );
    expect(response.body.timestamp).toBeDefined();
    expect(response.body.uptimeSeconds).toBeGreaterThanOrEqual(0);
  });

  it('/metrics (GET) should expose process and HTTP metrics', async () => {
    await request(app.getHttpServer()).get('/auth/me').expect(401);
    const response = await request(app.getHttpServer())
      .get('/metrics')
      .expect(200);

    expect(response.body.process).toEqual(
      expect.objectContaining({
        uptimeSeconds: expect.any(Number),
        memoryRssBytes: expect.any(Number),
      }),
    );
    expect(response.body.http).toEqual(
      expect.objectContaining({
        totalRequests: expect.any(Number),
        totalErrors: expect.any(Number),
      }),
    );
    expect(response.body.http.totalRequests).toBeGreaterThanOrEqual(1);
  });
});
