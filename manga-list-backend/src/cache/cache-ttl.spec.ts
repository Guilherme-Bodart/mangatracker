import { createCache } from 'cache-manager';
import { CACHE_TTL_MS } from './cache-ttl.constants';

describe('Cache TTL expiration (milliseconds)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  async function expectKeyToExpire(
    key: string,
    value: string | number,
    ttlMs: number,
  ) {
    const cache = createCache();

    await cache.set(key, value, ttlMs);
    await expect(cache.get(key)).resolves.toBe(value);

    jest.advanceTimersByTime(ttlMs + 1);
    await Promise.resolve();

    await expect(cache.get(key)).resolves.toBeUndefined();
    await cache.disconnect();
  }

  it('expires csrf token entries with csrf TTL', async () => {
    await expectKeyToExpire(
      'csrf:user:test-user',
      'csrf-token',
      CACHE_TTL_MS.CSRF_TOKEN,
    );
  });

  it('expires password reset entries with password reset TTL', async () => {
    await expectKeyToExpire(
      'password-reset:test-token',
      'test-user',
      CACHE_TTL_MS.PASSWORD_RESET_TOKEN,
    );
  });

  it('expires rate-limit entries with rate-limit window TTL', async () => {
    await expectKeyToExpire(
      'rate-limit:POST:_login:ip:127_0_0_1:123',
      1,
      CACHE_TTL_MS.AUTH_RATE_LIMIT_WINDOW,
    );
  });
});
