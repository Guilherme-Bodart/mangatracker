import { UnauthorizedException } from '@nestjs/common';
import { IntegrationsController } from './integrations.controller';

describe('IntegrationsController', () => {
  const integrationsService = {
    startConnection: jest.fn(),
    exchangeConnectionCode: jest.fn(),
    createPartnerApplication: jest.fn(),
    syncWithIntegrationToken: jest.fn(),
    listPartners: jest.fn(),
    listPartnerApplications: jest.fn(),
    approvePartnerApplication: jest.fn(),
    rejectPartnerApplication: jest.fn(),
    createPartner: jest.fn(),
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
});
