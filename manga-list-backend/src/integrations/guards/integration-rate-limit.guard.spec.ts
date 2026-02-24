import { HttpStatus } from '@nestjs/common';
import { CACHE_TTL_MS } from '../../cache/cache-ttl.constants';
import { IntegrationRateLimitGuard } from './integration-rate-limit.guard';

describe('IntegrationRateLimitGuard', () => {
  const store = new Map<string, number>();

  const cacheManager = {
    get: jest.fn(async (key: string) => store.get(key)),
    set: jest.fn(async (key: string, value: number) => {
      store.set(key, value);
    }),
  };

  const createContext = (request: Record<string, unknown>) => {
    const response = {
      setHeader: jest.fn(),
    };

    return {
      response,
      context: {
        switchToHttp: () => ({
          getRequest: () => request,
          getResponse: () => response,
        }),
      },
    };
  };

  beforeEach(() => {
    store.clear();
    jest.clearAllMocks();
  });

  it('should rate-limit connect exchange by partner slug and ip', async () => {
    const guard = new IntegrationRateLimitGuard(cacheManager as never);
    const request = {
      method: 'POST',
      route: { path: '/connect/exchange' },
      ip: '10.0.0.1',
      body: { partnerSlug: 'site-a' },
    };

    const { context } = createContext(request);
    await expect(guard.canActivate(context as never)).resolves.toBe(true);

    expect(cacheManager.set).toHaveBeenCalledWith(
      expect.stringContaining(
        'integrations:rate-limit:POST:_connect_exchange:slug:site-a:ip:10_0_0_1:',
      ),
      1,
      CACHE_TTL_MS.INTEGRATION_RATE_LIMIT_WINDOW,
    );
  });

  it('should block sync when per-bucket limit is reached', async () => {
    const guard = new IntegrationRateLimitGuard(cacheManager as never);
    const bucket = Math.floor(Date.now() / CACHE_TTL_MS.INTEGRATION_RATE_LIMIT_WINDOW);
    store.set(
      `integrations:rate-limit:POST:_sync:p:partner-1:u:user-1:${bucket}`,
      120,
    );

    const request = {
      method: 'POST',
      route: { path: '/sync' },
      integrationAuth: {
        userId: 'user-1',
        partnerId: 'partner-1',
      },
    };

    const { context, response } = createContext(request);
    await expect(guard.canActivate(context as never)).rejects.toHaveProperty(
      'status',
      HttpStatus.TOO_MANY_REQUESTS,
    );
    expect(response.setHeader).toHaveBeenCalledWith(
      'X-RateLimit-Remaining',
      '0',
    );
  });

  it('should ignore unknown routes', async () => {
    const guard = new IntegrationRateLimitGuard(cacheManager as never);
    const request = {
      method: 'GET',
      route: { path: '/admin/partners' },
      ip: '10.0.0.1',
    };

    const { context } = createContext(request);
    await expect(guard.canActivate(context as never)).resolves.toBe(true);
    expect(cacheManager.get).not.toHaveBeenCalled();
  });
});
