import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import * as dns from 'dns/promises';
import { IntegrationsService } from './integrations.service';

describe('IntegrationsService', () => {
  const cacheStore = new Map<string, unknown>();

  const prisma = {
    integrationPartner: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    integrationPartnerApplication: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    integrationSecretUsageLog: {
      create: jest.fn(),
      groupBy: jest.fn(),
    },
    integrationWebhookEndpoint: {
      findMany: jest.fn(),
      create: jest.fn(),
    },
    integrationWebhookEventLog: {
      create: jest.fn(),
    },
    integrationWebhookDeliveryLog: {
      create: jest.fn(),
      groupBy: jest.fn(),
      findMany: jest.fn(),
    },
    userPartnerConnection: {
      findFirst: jest.fn(),
      upsert: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const tx = {
    externalMangaMap: {
      findUnique: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
    },
    userManga: {
      findFirst: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
    },
    manga: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    syncEventLog: {
      create: jest.fn(),
    },
  };

  const jwtService = {
    sign: jest.fn(() => 'integration-token'),
  };

  const configService = {
    get: jest.fn((key: string): string | undefined => {
      if (key === 'JWT_SECRET') return 'jwt-secret';
      if (key === 'INTEGRATION_PUBLIC_PARTNERS') return 'mangalivre';
      return undefined;
    }),
  };

  const cacheManager = {
    get: jest.fn(async (key: string) => cacheStore.get(key)),
    set: jest.fn(async (key: string, value: unknown) => {
      cacheStore.set(key, value);
    }),
    del: jest.fn(async (key: string) => {
      cacheStore.delete(key);
    }),
  };

  const mailService = {
    sendIntegrationApprovedEmail: jest.fn(),
  };

  let service: IntegrationsService;

  beforeEach(() => {
    jest.clearAllMocks();
    cacheStore.clear();
    configService.get.mockImplementation((key: string): string | undefined => {
      if (key === 'JWT_SECRET') return 'jwt-secret';
      if (key === 'INTEGRATION_PUBLIC_PARTNERS') return 'mangalivre';
      return undefined;
    });
    prisma.integrationWebhookEndpoint.findMany.mockResolvedValue([]);
    prisma.integrationWebhookEventLog.create.mockResolvedValue({
      id: 'evt-1',
      eventType: 'integration.sync.v1',
      payload: {},
    });
    prisma.integrationWebhookDeliveryLog.create.mockResolvedValue(undefined);
    prisma.integrationWebhookDeliveryLog.groupBy.mockResolvedValue([]);
    prisma.integrationWebhookDeliveryLog.findMany.mockResolvedValue([]);
    prisma.integrationSecretUsageLog.groupBy.mockResolvedValue([]);
    prisma.$transaction.mockImplementation(
      async (callback: (value: typeof tx) => Promise<unknown>) => callback(tx),
    );
    service = new IntegrationsService(
      prisma as never,
      jwtService as never,
      configService as never,
      cacheManager as never,
      mailService as never,
    );
  });

  it('returns noop when incoming chapter is not greater', async () => {
    prisma.integrationPartner.findFirst.mockResolvedValue({
      id: 'partner-1',
      slug: 'site-a',
      allowedDomains: ['site-a.com'],
      isActive: true,
    });
    prisma.userPartnerConnection.findFirst.mockResolvedValue({
      id: 'conn-1',
      scopes: ['manga:write'],
      isActive: true,
    });
    tx.externalMangaMap.findUnique.mockResolvedValue({
      id: 'map-1',
      mangaId: 'manga-1',
    });
    tx.userManga.findFirst.mockResolvedValue({
      id: 'entry-1',
      currentChapter: 30,
    });

    const result = await service.syncWithIntegrationToken(
      {
        userId: 'user-1',
        partnerId: 'partner-1',
        partnerSlug: 'site-a',
        scopes: ['manga:write'],
      },
      {
        partnerSlug: 'site-a',
        externalMangaId: 'abc',
        title: 'One Piece',
        chapter: 28,
        sourceDomain: 'site-a.com',
      },
    );

    expect(result.outcome).toBe('noop');
    expect(result.currentChapter).toBe(30);
    expect(tx.userManga.update).not.toHaveBeenCalled();
    expect(tx.syncEventLog.create).toHaveBeenCalled();
  });

  it('creates minimal entry when manga is not mapped yet', async () => {
    prisma.integrationPartner.findFirst.mockResolvedValue({
      id: 'partner-1',
      slug: 'site-a',
      allowedDomains: [],
      isActive: true,
    });
    prisma.userPartnerConnection.findFirst.mockResolvedValue({
      id: 'conn-1',
      scopes: ['manga:write'],
      isActive: true,
    });
    tx.externalMangaMap.findUnique.mockResolvedValue(null);
    tx.manga.findUnique.mockResolvedValue(null);
    tx.manga.create.mockResolvedValue({
      id: 'manga-new',
      malId: -123,
      title: 'Bleach',
      genres: [],
    });
    tx.userManga.findFirst.mockResolvedValue(null);
    tx.userManga.create.mockResolvedValue({
      id: 'entry-new',
      currentChapter: 12,
    });

    const result = await service.syncWithIntegrationToken(
      {
        userId: 'user-1',
        partnerId: 'partner-1',
        partnerSlug: 'site-a',
        scopes: ['manga:write'],
      },
      {
        partnerSlug: 'site-a',
        externalMangaId: 'bleach-xyz',
        title: 'Bleach',
        chapter: 12,
      },
    );

    expect(result.outcome).toBe('created');
    expect(tx.manga.create).toHaveBeenCalled();
    expect(tx.userManga.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'READING',
          currentChapter: 12,
        }),
      }),
    );
    expect(tx.externalMangaMap.create).toHaveBeenCalled();
  });

  it('exchanges connect code and returns integration token', async () => {
    const secret = 'partner-secret';
    const clientSecretHash = await bcrypt.hash(secret, 4);
    prisma.integrationPartner.findFirst.mockResolvedValue({
      id: 'partner-1',
      slug: 'site-a',
      allowedDomains: ['site-a.com'],
      clientSecretHash,
      isActive: true,
    });

    await cacheManager.set('integrations:connect:code-1', {
      userId: 'user-1',
      partnerId: 'partner-1',
      partnerSlug: 'site-a',
      scopes: ['manga:write'],
      sourceDomain: 'site-a.com',
    });

    const result = await service.exchangeConnectionCode({
      partnerSlug: 'site-a',
      clientSecret: secret,
      code: 'code-1',
      sourceDomain: 'site-a.com',
    });

    expect(prisma.userPartnerConnection.upsert).toHaveBeenCalled();
    expect(jwtService.sign).toHaveBeenCalled();
    expect(result.accessToken).toBe('integration-token');
    expect(cacheManager.del).toHaveBeenCalledWith('integrations:connect:code-1');
  });

  it('exchanges connect code without clientSecret for public partner', async () => {
    prisma.integrationPartner.findFirst.mockResolvedValue({
      id: 'partner-1',
      slug: 'mangalivre',
      allowedDomains: ['mangalivre.tv'],
      clientSecretHash: await bcrypt.hash('unused-secret', 4),
      isActive: true,
    });

    await cacheManager.set('integrations:connect:code-public', {
      userId: 'user-1',
      partnerId: 'partner-1',
      partnerSlug: 'mangalivre',
      scopes: ['manga:write'],
      sourceDomain: 'mangalivre.tv',
    });

    const result = await service.exchangeConnectionCode({
      partnerSlug: 'mangalivre',
      code: 'code-public',
      sourceDomain: 'mangalivre.tv',
    });

    expect(prisma.userPartnerConnection.upsert).toHaveBeenCalled();
    expect(result.accessToken).toBe('integration-token');
  });

  it('accepts previous partner secret during transition window and audits usage', async () => {
    const currentSecretHash = await bcrypt.hash('current-secret', 4);
    const previousSecretHash = await bcrypt.hash('old-secret', 4);
    prisma.integrationPartner.findFirst.mockResolvedValue({
      id: 'partner-1',
      slug: 'site-a',
      allowedDomains: ['site-a.com'],
      clientSecretHash: currentSecretHash,
      previousClientSecretHash: previousSecretHash,
      previousClientSecretExpiresAt: new Date(Date.now() + 60_000),
      isActive: true,
    });

    await cacheManager.set('integrations:connect:code-2', {
      userId: 'user-1',
      partnerId: 'partner-1',
      partnerSlug: 'site-a',
      scopes: ['manga:write'],
      sourceDomain: 'site-a.com',
    });

    const result = await service.exchangeConnectionCode({
      partnerSlug: 'site-a',
      clientSecret: 'old-secret',
      code: 'code-2',
      sourceDomain: 'site-a.com',
    });

    expect(result.accessToken).toBe('integration-token');
    expect(prisma.integrationSecretUsageLog.create).toHaveBeenCalledWith({
      data: {
        partnerId: 'partner-1',
        secretVersion: 'PREVIOUS',
        sourceDomain: 'site-a.com',
      },
    });
  });

  it('rejects previous partner secret when transition window has expired', async () => {
    const currentSecretHash = await bcrypt.hash('current-secret', 4);
    const previousSecretHash = await bcrypt.hash('old-secret', 4);
    prisma.integrationPartner.findFirst.mockResolvedValue({
      id: 'partner-1',
      slug: 'site-a',
      allowedDomains: ['site-a.com'],
      clientSecretHash: currentSecretHash,
      previousClientSecretHash: previousSecretHash,
      previousClientSecretExpiresAt: new Date(Date.now() - 60_000),
      isActive: true,
    });

    await cacheManager.set('integrations:connect:code-3', {
      userId: 'user-1',
      partnerId: 'partner-1',
      partnerSlug: 'site-a',
      scopes: ['manga:write'],
      sourceDomain: 'site-a.com',
    });

    await expect(
      service.exchangeConnectionCode({
        partnerSlug: 'site-a',
        clientSecret: 'old-secret',
        code: 'code-3',
        sourceDomain: 'site-a.com',
      }),
    ).rejects.toThrow('Invalid partner credentials');
  });

  it('rotates secret and keeps previous secret active during transition window', async () => {
    prisma.integrationPartner.findUnique.mockResolvedValue({
      id: 'partner-1',
      slug: 'site-a',
      clientSecretHash: 'old-secret-hash',
    });

    const result = await service.rotatePartnerSecret('partner-1', {
      clientSecret: 'new-secret',
      transitionWindowHours: 4,
    });

    expect(prisma.integrationPartner.update).toHaveBeenCalledWith({
      where: { id: 'partner-1' },
      data: expect.objectContaining({
        previousClientSecretHash: 'old-secret-hash',
        previousClientSecretExpiresAt: expect.any(Date),
      }),
    });
    expect(result.id).toBe('partner-1');
    expect(result.clientSecret).toBe('new-secret');
    expect(result.transitionWindowHours).toBe(4);
  });

  it('creates webhook endpoint with generated signing secret', async () => {
    prisma.integrationPartner.findUnique.mockResolvedValueOnce({
      id: 'partner-1',
    });
    prisma.integrationWebhookEndpoint.create.mockResolvedValueOnce({
      id: 'wh-1',
      partnerId: 'partner-1',
      url: 'https://site-a.com/webhooks/mangalist',
      isActive: true,
      createdAt: new Date('2026-03-13T10:00:00.000Z'),
      updatedAt: new Date('2026-03-13T10:00:00.000Z'),
    });

    const result = await service.createPartnerWebhook('partner-1', {
      url: 'https://site-a.com/webhooks/mangalist',
    });

    expect(result.id).toBe('wh-1');
    expect(result.signingSecret).toBeDefined();
    expect(prisma.integrationWebhookEndpoint.create).toHaveBeenCalled();
  });

  it('retries webhook delivery with same event id and sends to DLQ after max attempts', async () => {
    configService.get.mockImplementation((key: string) => {
      if (key === 'JWT_SECRET') return 'jwt-secret';
      if (key === 'INTEGRATION_PUBLIC_PARTNERS') return 'mangalivre';
      if (key === 'INTEGRATION_WEBHOOK_MAX_ATTEMPTS') return '2';
      if (key === 'INTEGRATION_WEBHOOK_INITIAL_BACKOFF_MS') return '1';
      if (key === 'INTEGRATION_WEBHOOK_MAX_BACKOFF_MS') return '2';
      if (key === 'INTEGRATION_WEBHOOK_TIMEOUT_MS') return '1000';
      return undefined;
    });

    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce({ ok: false, status: 500 } as Response)
      .mockResolvedValueOnce({ ok: false, status: 500 } as Response);

    const webhookInternals = service as unknown as {
      deliverWebhookEventWithRetry: (args: {
        endpointId: string;
        endpointUrl: string;
        signingSecret: string;
        eventId: string;
        eventType: string;
        payload: Record<string, string>;
      }) => Promise<void>;
    };

    await webhookInternals.deliverWebhookEventWithRetry({
      endpointId: 'wh-1',
      endpointUrl: 'https://site-a.com/webhooks/mangalist',
      signingSecret: 'wh-secret',
      eventId: 'evt-1',
      eventType: 'integration.sync.v1',
      payload: { hello: 'world' },
    });

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    const firstHeaders = fetchSpy.mock.calls[0][1]?.headers as Record<string, string>;
    const secondHeaders = fetchSpy.mock.calls[1][1]?.headers as Record<string, string>;
    expect(firstHeaders['x-mangalist-event-id']).toBe('evt-1');
    expect(secondHeaders['x-mangalist-event-id']).toBe('evt-1');
    expect(firstHeaders['x-mangalist-delivery-attempt']).toBe('1');
    expect(secondHeaders['x-mangalist-delivery-attempt']).toBe('2');
    expect(prisma.integrationWebhookDeliveryLog.create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'RETRY',
          attempt: 1,
        }),
      }),
    );
    expect(prisma.integrationWebhookDeliveryLog.create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'DLQ',
          attempt: 2,
        }),
      }),
    );

    fetchSpy.mockRestore();
  });

  it('returns cached sync result when idempotency key is reused', async () => {
    prisma.integrationPartner.findFirst.mockResolvedValue({
      id: 'partner-1',
      slug: 'site-a',
      allowedDomains: [],
      isActive: true,
    });
    prisma.userPartnerConnection.findFirst.mockResolvedValue({
      id: 'conn-1',
      scopes: ['manga:write'],
      isActive: true,
    });
    tx.externalMangaMap.findUnique.mockResolvedValue(null);
    tx.manga.findUnique.mockResolvedValue(null);
    tx.manga.create.mockResolvedValue({
      id: 'manga-new',
      malId: -123,
      title: 'Bleach',
      genres: [],
    });
    tx.userManga.findFirst.mockResolvedValue(null);
    tx.userManga.create.mockResolvedValue({
      id: 'entry-new',
      currentChapter: 12,
    });

    const auth = {
      userId: 'user-1',
      partnerId: 'partner-1',
      partnerSlug: 'site-a',
      scopes: ['manga:write'],
    };
    const dto = {
      partnerSlug: 'site-a',
      externalMangaId: 'bleach-xyz',
      title: 'Bleach',
      chapter: 12,
    };

    const first = await service.syncWithIntegrationToken(auth, dto, 'idem-1');
    const second = await service.syncWithIntegrationToken(auth, dto, 'idem-1');

    expect(first).toEqual(second);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('returns connected=true in connection status when partner and connection are active', async () => {
    prisma.integrationPartner.findFirst.mockResolvedValue({
      id: 'partner-1',
      slug: 'site-a',
      isActive: true,
    });
    prisma.userPartnerConnection.findFirst.mockResolvedValue({
      id: 'conn-1',
      isActive: true,
      scopes: ['manga:write'],
      updatedAt: new Date('2026-03-11T12:00:00.000Z'),
    });

    const result = await service.getConnectionStatus({
      userId: 'user-1',
      partnerId: 'partner-1',
      partnerSlug: 'site-a',
      scopes: ['manga:write'],
      tokenExpiresAt: '2026-04-10T12:00:00.000Z',
    });

    expect(result.connected).toBe(true);
    expect(result.checks.partnerActive).toBe(true);
    expect(result.checks.connectionActive).toBe(true);
    expect(result.tokenExpiresAt).toBe('2026-04-10T12:00:00.000Z');
  });

  it('returns connected=false in connection status when connection is missing', async () => {
    prisma.integrationPartner.findFirst.mockResolvedValue({
      id: 'partner-1',
      slug: 'site-a',
      isActive: true,
    });
    prisma.userPartnerConnection.findFirst.mockResolvedValue(null);

    const result = await service.getConnectionStatus({
      userId: 'user-1',
      partnerId: 'partner-1',
      partnerSlug: 'site-a',
      scopes: ['manga:write'],
    });

    expect(result.connected).toBe(false);
    expect(result.checks.connectionExists).toBe(false);
  });

  it('returns public application status with nextAction', async () => {
    prisma.integrationPartnerApplication.findUnique.mockResolvedValue({
      id: 'app-1',
      requestedSlug: 'site-a',
      verificationDomain: 'site-a.com',
      domainVerificationToken: 'token-1',
      domainVerificationStatus: 'VERIFIED',
      domainVerificationError: null,
      domainVerificationLastCheckedAt: new Date('2026-03-11T10:00:00.000Z'),
      domainVerifiedAt: new Date('2026-03-11T10:00:00.000Z'),
      status: 'PENDING',
      reviewReason: null,
      createdAt: new Date('2026-03-11T10:00:00.000Z'),
      reviewedAt: null,
      updatedAt: new Date('2026-03-11T10:00:00.000Z'),
    });

    const result = await service.getPublicApplicationStatus('app-1');

    expect(prisma.integrationPartnerApplication.findUnique).toHaveBeenCalledWith({
      where: { id: 'app-1' },
      select: {
        id: true,
        requestedSlug: true,
        verificationDomain: true,
        domainVerificationToken: true,
        domainVerificationStatus: true,
        domainVerificationError: true,
        domainVerificationLastCheckedAt: true,
        domainVerifiedAt: true,
        status: true,
        reviewReason: true,
        createdAt: true,
        reviewedAt: true,
        updatedAt: true,
      },
    });
    expect(result.nextAction).toBe('WAIT_APPROVAL');
    expect(result.domainVerificationDnsRecordName).toBe(
      '_manga-tracker-verification.site-a.com',
    );
  });

  it('returns VERIFY_DOMAIN nextAction when domain is not verified yet', async () => {
    prisma.integrationPartnerApplication.findUnique.mockResolvedValue({
      id: 'app-2',
      requestedSlug: 'site-b',
      verificationDomain: 'site-b.com',
      domainVerificationToken: 'token-2',
      domainVerificationStatus: 'PENDING',
      domainVerificationError: null,
      domainVerificationLastCheckedAt: null,
      domainVerifiedAt: null,
      status: 'PENDING',
      reviewReason: null,
      createdAt: new Date('2026-03-11T10:00:00.000Z'),
      reviewedAt: null,
      updatedAt: new Date('2026-03-11T10:00:00.000Z'),
    });

    const result = await service.getPublicApplicationStatus('app-2');

    expect(result.nextAction).toBe('VERIFY_DOMAIN');
  });

  it('rejects public application when honeypot field is filled', async () => {
    await expect(
      service.createPartnerApplication({
        requestedSlug: 'site-a',
        name: 'Site A',
        contactEmail: 'tech@site-a.com',
        siteUrl: 'https://site-a.com',
        website: 'bot-filled-value',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects public application when domain cooldown is active', async () => {
    await cacheManager.set('integrations:public-apply:domain:site-a.com', 'app-1');

    try {
      await service.createPartnerApplication({
        requestedSlug: 'site-a',
        name: 'Site A',
        contactEmail: 'tech@site-a.com',
        siteUrl: 'https://site-a.com',
      });
      fail('Expected domain cooldown to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getStatus()).toBe(
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  });

  it('requires captcha token when captcha secret is configured', async () => {
    configService.get.mockImplementation((key: string) => {
      if (key === 'JWT_SECRET') return 'jwt-secret';
      if (key === 'INTEGRATION_PUBLIC_PARTNERS') return 'mangalivre';
      if (key === 'INTEGRATION_PUBLIC_APPLY_CAPTCHA_SECRET') return 'secret';
      return undefined;
    });

    await expect(
      service.createPartnerApplication({
        requestedSlug: 'site-a',
        name: 'Site A',
        contactEmail: 'tech@site-a.com',
        siteUrl: 'https://site-a.com',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('verifies domain using DNS TXT record', async () => {
    const dnsSpy = jest
      .spyOn(dns, 'resolveTxt')
      .mockResolvedValue([['token-dns-1']]);

    prisma.integrationPartnerApplication.findUnique.mockResolvedValue({
      id: 'app-1',
      siteUrl: 'https://site-a.com',
      status: 'PENDING',
      verificationDomain: 'site-a.com',
      domainVerificationToken: 'token-dns-1',
    });
    prisma.integrationPartnerApplication.update.mockResolvedValue({
      id: 'app-1',
      verificationDomain: 'site-a.com',
      domainVerificationToken: 'token-dns-1',
      domainVerificationStatus: 'VERIFIED',
      domainVerificationError: null,
      domainVerificationLastCheckedAt: new Date('2026-03-12T01:00:00.000Z'),
      domainVerifiedAt: new Date('2026-03-12T01:00:00.000Z'),
    });

    const result = await service.verifyPublicApplicationDomain('app-1');

    expect(dnsSpy).toHaveBeenCalledWith('_manga-tracker-verification.site-a.com');
    expect(result.domainVerificationStatus).toBe('VERIFIED');
    expect(result.domainVerificationDnsRecordName).toBe(
      '_manga-tracker-verification.site-a.com',
    );
    dnsSpy.mockRestore();
  });

  it('blocks approval when application domain is not verified', async () => {
    prisma.integrationPartnerApplication.findUnique.mockResolvedValue({
      id: 'app-1',
      requestedSlug: 'site-a',
      name: 'Site A',
      contactEmail: 'tech@site-a.com',
      allowedDomains: ['site-a.com'],
      verificationDomain: 'site-a.com',
      domainVerificationStatus: 'PENDING',
      domainVerifiedAt: null,
      status: 'PENDING',
    });

    await expect(
      service.approvePartnerApplication('app-1', 'admin@example.com', {}),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
