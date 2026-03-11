import * as bcrypt from 'bcryptjs';
import { IntegrationsService } from './integrations.service';

describe('IntegrationsService', () => {
  const cacheStore = new Map<string, unknown>();

  const prisma = {
    integrationPartner: {
      findFirst: jest.fn(),
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
    get: jest.fn((key: string) => {
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
});
