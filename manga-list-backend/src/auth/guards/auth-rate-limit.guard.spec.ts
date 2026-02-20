import { HttpStatus } from '@nestjs/common';
import { AuthRateLimitGuard } from './auth-rate-limit.guard';
import { CACHE_TTL_MS } from '../../cache/cache-ttl.constants';

describe('AuthRateLimitGuard', () => {
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

  it('should rate-limit pre-auth by ip and email', async () => {
    const guard = new AuthRateLimitGuard(cacheManager as never);
    const request = {
      method: 'POST',
      route: { path: '/login' },
      ip: '10.0.0.1',
      body: { email: 'test@example.com' },
      headers: {},
    };

    const { context } = createContext(request);
    await expect(guard.canActivate(context as never)).resolves.toBe(true);

    expect(cacheManager.set).toHaveBeenCalledWith(
      expect.stringContaining('rate-limit:POST:_login:ip:10_0_0_1:'),
      1,
      CACHE_TTL_MS.AUTH_RATE_LIMIT_WINDOW,
    );
    expect(cacheManager.set).toHaveBeenCalledWith(
      expect.stringContaining('rate-limit:POST:_login:email:test_example_com:'),
      1,
      CACHE_TTL_MS.AUTH_RATE_LIMIT_WINDOW,
    );
    expect(cacheManager.set).toHaveBeenCalledWith(
      'rate-limit:metrics:POST:_login:allowed',
      1,
      CACHE_TTL_MS.AUTH_RATE_LIMIT_METRICS,
    );
  });

  it('should block when ip limit is reached', async () => {
    const guard = new AuthRateLimitGuard(cacheManager as never);
    const nowBucket = Math.floor(
      Date.now() / CACHE_TTL_MS.AUTH_RATE_LIMIT_WINDOW,
    );
    store.set(`rate-limit:POST:_login:ip:10_0_0_1:${nowBucket}`, 10);

    const request = {
      method: 'POST',
      route: { path: '/login' },
      ip: '10.0.0.1',
      body: { email: 'test@example.com' },
      headers: {},
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
    expect(cacheManager.set).toHaveBeenCalledWith(
      'rate-limit:metrics:POST:_login:blocked',
      1,
      CACHE_TTL_MS.AUTH_RATE_LIMIT_METRICS,
    );
  });

  it('should block authenticated users by userId even with different ips', async () => {
    const guard = new AuthRateLimitGuard(cacheManager as never);
    const nowBucket = Math.floor(
      Date.now() / CACHE_TTL_MS.AUTH_RATE_LIMIT_WINDOW,
    );
    store.set(`rate-limit:GET:_refresh:user:user-1:${nowBucket}`, 30);

    const request = {
      method: 'GET',
      route: { path: '/refresh' },
      ip: '10.0.0.2',
      user: { id: 'user-1' },
      headers: {},
    };

    const { context } = createContext(request);
    await expect(guard.canActivate(context as never)).rejects.toHaveProperty(
      'status',
      HttpStatus.TOO_MANY_REQUESTS,
    );
  });

  it('should ignore spoofed x-forwarded-for when enforcing limits', async () => {
    const guard = new AuthRateLimitGuard(cacheManager as never);
    const nowBucket = Math.floor(
      Date.now() / CACHE_TTL_MS.AUTH_RATE_LIMIT_WINDOW,
    );
    store.set(`rate-limit:POST:_login:ip:10_0_0_1:${nowBucket}`, 10);

    const request = {
      method: 'POST',
      route: { path: '/login' },
      ip: '10.0.0.1',
      body: { email: 'test@example.com' },
      headers: { 'x-forwarded-for': '8.8.8.8' },
    };

    const { context } = createContext(request);
    await expect(guard.canActivate(context as never)).rejects.toHaveProperty(
      'status',
      HttpStatus.TOO_MANY_REQUESTS,
    );

    const lookupKeys = cacheManager.get.mock.calls.map(([key]) => String(key));
    expect(lookupKeys.some((key) => key.includes('ip:8_8_8_8'))).toBe(false);
    expect(lookupKeys.some((key) => key.includes('ip:10_0_0_1'))).toBe(true);
  });

  it('should normalize ipv4-mapped ipv6 remote addresses', async () => {
    const guard = new AuthRateLimitGuard(cacheManager as never);
    const request = {
      method: 'POST',
      route: { path: '/login' },
      socket: { remoteAddress: '::ffff:172.16.1.12' },
      body: { email: 'test@example.com' },
      headers: {},
    };

    const { context } = createContext(request);
    await expect(guard.canActivate(context as never)).resolves.toBe(true);

    expect(cacheManager.set).toHaveBeenCalledWith(
      expect.stringContaining('ip:172_16_1_12:'),
      1,
      CACHE_TTL_MS.AUTH_RATE_LIMIT_WINDOW,
    );
  });
});
