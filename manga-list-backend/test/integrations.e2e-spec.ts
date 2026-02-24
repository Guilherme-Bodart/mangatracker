import { CanActivate, ExecutionContext, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { JwtAuthGuard } from '../src/auth/guards/jwt-auth.guard';
import { CsrfGuard } from '../src/auth/guards/csrf.guard';
import { ApiExceptionFilter } from '../src/common/filters/api-exception.filter';
import { requestTraceMiddleware } from '../src/common/middleware/request-trace.middleware';
import { IntegrationsService } from '../src/integrations/integrations.service';
import { IntegrationAdminGuard } from '../src/integrations/guards/integration-admin.guard';
import { IntegrationRateLimitGuard } from '../src/integrations/guards/integration-rate-limit.guard';
import { IntegrationTokenGuard } from '../src/integrations/guards/integration-token.guard';

class MockJwtAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<{ user?: { id: string; email: string } }>();
    req.user = { id: 'user-1', email: 'admin.integration@example.com' };
    return true;
  }
}

class MockCsrfGuard implements CanActivate {
  canActivate(): boolean {
    return true;
  }
}

class MockIntegrationAdminGuard implements CanActivate {
  canActivate(): boolean {
    return true;
  }
}

class MockIntegrationRateLimitGuard implements CanActivate {
  canActivate(): boolean {
    return true;
  }
}

class MockIntegrationTokenGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<{
      integrationAuth?: {
        userId: string;
        partnerId: string;
        partnerSlug: string;
        scopes: string[];
      };
    }>();
    req.integrationAuth = {
      userId: 'user-1',
      partnerId: 'partner-1',
      partnerSlug: 'site-a',
      scopes: ['manga:write'],
    };
    return true;
  }
}

describe('Integrations routes (e2e)', () => {
  let app: INestApplication;

  const integrationsService = {
    startConnection: jest.fn(async () => ({ code: 'code-1', expiresInMs: 300000 })),
    exchangeConnectionCode: jest.fn(async () => ({
      accessToken: 'integration-token',
      tokenType: 'Bearer',
      expiresInSeconds: 3600,
      scopes: ['manga:write'],
    })),
    syncWithIntegrationToken: jest.fn(async () => ({
      outcome: 'created',
      userMangaId: 'um-1',
      currentChapter: 10,
    })),
    listPartners: jest.fn(async () => []),
    createPartner: jest.fn(async () => ({
      id: 'partner-1',
      slug: 'site-a',
      name: 'Site A',
      clientSecret: 'secret',
    })),
    updatePartner: jest.fn(),
    rotatePartnerSecret: jest.fn(),
    listConnections: jest.fn(async () => []),
    revokeConnection: jest.fn(),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(IntegrationsService)
      .useValue(integrationsService)
      .overrideGuard(JwtAuthGuard)
      .useClass(MockJwtAuthGuard)
      .overrideGuard(CsrfGuard)
      .useClass(MockCsrfGuard)
      .overrideGuard(IntegrationAdminGuard)
      .useClass(MockIntegrationAdminGuard)
      .overrideGuard(IntegrationRateLimitGuard)
      .useClass(MockIntegrationRateLimitGuard)
      .overrideGuard(IntegrationTokenGuard)
      .useClass(MockIntegrationTokenGuard)
      .compile();

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

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should expose connect/start and connect/exchange routes', async () => {
    await request(app.getHttpServer())
      .post('/integrations/connect/start')
      .send({
        partnerSlug: 'site-a',
        sourceDomain: 'site-a.com',
        scopes: ['manga:write'],
      })
      .expect(201)
      .expect(({ body }) => {
        expect(body.code).toBe('code-1');
      });

    await request(app.getHttpServer())
      .post('/integrations/connect/exchange')
      .send({
        partnerSlug: 'site-a',
        clientSecret: 'secret',
        code: 'code-1',
      })
      .expect(201)
      .expect(({ body }) => {
        expect(body.accessToken).toBe('integration-token');
      });

    expect(integrationsService.startConnection).toHaveBeenCalled();
    expect(integrationsService.exchangeConnectionCode).toHaveBeenCalled();
  });

  it('should call sync with integration auth and idempotency key', async () => {
    await request(app.getHttpServer())
      .post('/integrations/sync')
      .set('Authorization', 'Bearer any-token')
      .set('x-idempotency-key', 'evt-123')
      .send({
        partnerSlug: 'site-a',
        externalMangaId: 'ext-1',
        title: 'Manga',
        chapter: 10,
      })
      .expect(201)
      .expect(({ body }) => {
        expect(body.outcome).toBe('created');
      });

    expect(integrationsService.syncWithIntegrationToken).toHaveBeenCalledWith(
      {
        userId: 'user-1',
        partnerId: 'partner-1',
        partnerSlug: 'site-a',
        scopes: ['manga:write'],
      },
      {
        partnerSlug: 'site-a',
        externalMangaId: 'ext-1',
        title: 'Manga',
        chapter: 10,
      },
      'evt-123',
    );
  });

  it('should expose admin partners create route', async () => {
    await request(app.getHttpServer())
      .post('/integrations/admin/partners')
      .send({
        slug: 'site-a',
        name: 'Site A',
      })
      .expect(201)
      .expect(({ body }) => {
        expect(body.id).toBe('partner-1');
      });
    expect(integrationsService.createPartner).toHaveBeenCalled();
  });
});
