import { UnauthorizedException } from '@nestjs/common';
import { IntegrationsController } from './integrations.controller';

describe('IntegrationsController', () => {
  const integrationsService = {
    startConnection: jest.fn(),
    exchangeConnectionCode: jest.fn(),
    refreshConnectionToken: jest.fn(),
    createPartnerApplication: jest.fn(),
    getPublicApplicationStatus: jest.fn(),
    verifyPublicApplicationDomain: jest.fn(),
    syncWithIntegrationToken: jest.fn(),
    getConnectionStatus: jest.fn(),
    listPartners: jest.fn(),
    listPartnerApplications: jest.fn(),
    approvePartnerApplication: jest.fn(),
    rejectPartnerApplication: jest.fn(),
    createPartner: jest.fn(),
    listPartnerWebhooks: jest.fn(),
    createPartnerWebhook: jest.fn(),
    updatePartner: jest.fn(),
    rotatePartnerSecret: jest.fn(),
    listConnections: jest.fn(),
    revokeConnection: jest.fn(),
  };

  const controller = new IntegrationsController(integrationsService as never);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should call startConnection with authenticated user id', async () => {
    integrationsService.startConnection.mockResolvedValue({
      code: 'abc',
      expiresInMs: 1000,
    });

    const result = await controller.startConnection(
      { user: { id: 'user-1' } } as never,
      {
        partnerSlug: 'site-a',
        sourceDomain: 'site-a.com',
      },
    );

    expect(integrationsService.startConnection).toHaveBeenCalledWith('user-1', {
      partnerSlug: 'site-a',
      sourceDomain: 'site-a.com',
    });
    expect(result).toEqual({ code: 'abc', expiresInMs: 1000 });
  });

  it('should throw when startConnection is called without authenticated user', async () => {
    await expect(
      controller.startConnection({} as never, {
        partnerSlug: 'site-a',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('should call createPartnerApplication with requester ip', async () => {
    integrationsService.createPartnerApplication.mockResolvedValue({
      id: 'app-1',
      status: 'PENDING',
    });

    const result = await controller.createPartnerApplication(
      { ip: '127.0.0.1' } as never,
      {
        requestedSlug: 'site-a',
        name: 'Site A',
        contactEmail: 'tech@site-a.com',
        siteUrl: 'https://site-a.com',
      },
    );

    expect(integrationsService.createPartnerApplication).toHaveBeenCalledWith(
      {
        requestedSlug: 'site-a',
        name: 'Site A',
        contactEmail: 'tech@site-a.com',
        siteUrl: 'https://site-a.com',
      },
      '127.0.0.1',
    );
    expect(result).toEqual({
      id: 'app-1',
      status: 'PENDING',
    });
  });

  it('should refresh connection token from authorization header', async () => {
    integrationsService.refreshConnectionToken.mockResolvedValue({
      accessToken: 'new-token',
      tokenType: 'Bearer',
      expiresInSeconds: 2592000,
      scopes: ['manga:write'],
    });

    const result = await controller.refreshConnectionToken({
      headers: {
        authorization: 'Bearer old-token',
      },
    } as never);

    expect(integrationsService.refreshConnectionToken).toHaveBeenCalledWith(
      'Bearer old-token',
    );
    expect(result).toEqual({
      accessToken: 'new-token',
      tokenType: 'Bearer',
      expiresInSeconds: 2592000,
      scopes: ['manga:write'],
    });
  });

  it('should pass idempotency key to sync service', async () => {
    integrationsService.syncWithIntegrationToken.mockResolvedValue({
      outcome: 'updated',
      userMangaId: 'um-1',
      currentChapter: 100,
    });

    const result = await controller.sync(
      {
        integrationAuth: {
          userId: 'user-1',
          partnerId: 'partner-1',
          partnerSlug: 'site-a',
          scopes: ['manga:write'],
        },
        headers: {
          'x-idempotency-key': 'idem-123',
        },
      } as never,
      {
        partnerSlug: 'site-a',
        externalMangaId: 'op',
        title: 'One Piece',
        chapter: 100,
      },
    );

    expect(integrationsService.syncWithIntegrationToken).toHaveBeenCalledWith(
      {
        userId: 'user-1',
        partnerId: 'partner-1',
        partnerSlug: 'site-a',
        scopes: ['manga:write'],
      },
      {
        partnerSlug: 'site-a',
        externalMangaId: 'op',
        title: 'One Piece',
        chapter: 100,
      },
      'idem-123',
    );
    expect(result).toEqual({
      outcome: 'updated',
      userMangaId: 'um-1',
      currentChapter: 100,
    });
  });

  it('should use first idempotency key when header has multiple values', async () => {
    integrationsService.syncWithIntegrationToken.mockResolvedValue({
      outcome: 'noop',
      userMangaId: 'um-1',
      currentChapter: 100,
    });

    await controller.sync(
      {
        integrationAuth: {
          userId: 'user-1',
          partnerId: 'partner-1',
          partnerSlug: 'site-a',
          scopes: ['manga:write'],
        },
        headers: {
          'x-idempotency-key': ['idem-first', 'idem-second'],
        },
      } as never,
      {
        partnerSlug: 'site-a',
        externalMangaId: 'op',
        title: 'One Piece',
        chapter: 100,
      },
    );

    expect(integrationsService.syncWithIntegrationToken).toHaveBeenCalledWith(
      expect.any(Object),
      expect.any(Object),
      'idem-first',
    );
  });

  it('should throw when sync is called without integration auth', async () => {
    await expect(
      controller.sync(
        { headers: {} } as never,
        {
          partnerSlug: 'site-a',
          externalMangaId: 'op',
          title: 'One Piece',
          chapter: 100,
        },
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('should call getConnectionStatus with integration auth', async () => {
    integrationsService.getConnectionStatus.mockResolvedValue({
      connected: true,
    });

    const result = await controller.getConnectionStatus({
      integrationAuth: {
        userId: 'user-1',
        partnerId: 'partner-1',
        partnerSlug: 'site-a',
        scopes: ['manga:write'],
        tokenExpiresAt: '2030-01-01T00:00:00.000Z',
      },
    } as never);

    expect(integrationsService.getConnectionStatus).toHaveBeenCalledWith({
      userId: 'user-1',
      partnerId: 'partner-1',
      partnerSlug: 'site-a',
      scopes: ['manga:write'],
      tokenExpiresAt: '2030-01-01T00:00:00.000Z',
    });
    expect(result).toEqual({ connected: true });
  });

  it('should call getPublicApplicationStatus with route id', async () => {
    integrationsService.getPublicApplicationStatus.mockResolvedValue({
      id: 'app-1',
      status: 'PENDING',
      nextAction: 'WAIT_APPROVAL',
    });

    const result = await controller.getPublicApplicationStatus('app-1');

    expect(integrationsService.getPublicApplicationStatus).toHaveBeenCalledWith(
      'app-1',
    );
    expect(result).toEqual({
      id: 'app-1',
      status: 'PENDING',
      nextAction: 'WAIT_APPROVAL',
    });
  });

  it('should call verifyPublicApplicationDomain with route id', async () => {
    integrationsService.verifyPublicApplicationDomain.mockResolvedValue({
      id: 'app-1',
      domainVerificationStatus: 'VERIFIED',
    });

    const result = await controller.verifyPublicApplicationDomain('app-1');

    expect(integrationsService.verifyPublicApplicationDomain).toHaveBeenCalledWith(
      'app-1',
    );
    expect(result).toEqual({
      id: 'app-1',
      domainVerificationStatus: 'VERIFIED',
    });
  });

  it('should list partner webhooks for admin route', async () => {
    integrationsService.listPartnerWebhooks.mockResolvedValue({
      partner: { id: 'partner-1', slug: 'site-a', name: 'Site A' },
      endpoints: [],
    });

    const result = await controller.listPartnerWebhooks('partner-1');

    expect(integrationsService.listPartnerWebhooks).toHaveBeenCalledWith(
      'partner-1',
    );
    expect(result.partner.id).toBe('partner-1');
  });

  it('should create partner webhook for admin route', async () => {
    integrationsService.createPartnerWebhook.mockResolvedValue({
      id: 'wh-1',
      partnerId: 'partner-1',
      url: 'https://site-a.com/webhooks/mangalist',
      isActive: true,
      signingSecret: 'secret',
    });

    const result = await controller.createPartnerWebhook('partner-1', {
      url: 'https://site-a.com/webhooks/mangalist',
    });

    expect(integrationsService.createPartnerWebhook).toHaveBeenCalledWith(
      'partner-1',
      { url: 'https://site-a.com/webhooks/mangalist' },
    );
    expect(result.id).toBe('wh-1');
  });
});
