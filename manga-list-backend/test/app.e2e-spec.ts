import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from './../src/app.module';
import { ApiExceptionFilter } from '../src/common/filters/api-exception.filter';
import { requestTraceMiddleware } from '../src/common/middleware/request-trace.middleware';

describe('AppController (e2e)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.use(requestTraceMiddleware);
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
        message: 'Nao autorizado',
        path: '/auth/me',
      }),
    );
  });
});
