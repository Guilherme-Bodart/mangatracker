import { HttpStatus } from '@nestjs/common';
import { AuthRateLimitGuard } from './auth-rate-limit.guard';

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
      15 * 60 * 1000,
    );
    expect(cacheManager.set).toHaveBeenCalledWith(
      expect.stringContaining('rate-limit:POST:_login:email:test_example_com:'),
      1,
      15 * 60 * 1000,
    );
    expect(cacheManager.set).toHaveBeenCalledWith(
      'rate-limit:metrics:POST:_login:allowed',
      1,
      24 * 60 * 60 * 1000,
    );
  });

  it('should block when ip limit is reached', async () => {
    const guard = new AuthRateLimitGuard(cacheManager as never);
    const nowBucket = Math.floor(Date.now() / (15 * 60 * 1000));
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
      24 * 60 * 60 * 1000,
    );
  });

  it('should block authenticated users by userId even with different ips', async () => {
    const guard = new AuthRateLimitGuard(cacheManager as never);
    const nowBucket = Math.floor(Date.now() / (15 * 60 * 1000));
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
});
