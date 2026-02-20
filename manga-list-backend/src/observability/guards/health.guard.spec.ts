import { ForbiddenException } from '@nestjs/common';
import { ExecutionContext } from '@nestjs/common/interfaces';
import { HealthGuard } from './health.guard';

describe('HealthGuard', () => {
  const originalHealthPrivate = process.env.HEALTH_PRIVATE;
  const originalHealthApiKey = process.env.HEALTH_API_KEY;
  let guard: HealthGuard;

  beforeEach(() => {
    guard = new HealthGuard();
    delete process.env.HEALTH_PRIVATE;
    delete process.env.HEALTH_API_KEY;
  });

  afterAll(() => {
    if (originalHealthPrivate === undefined) {
      delete process.env.HEALTH_PRIVATE;
    } else {
      process.env.HEALTH_PRIVATE = originalHealthPrivate;
    }

    if (originalHealthApiKey === undefined) {
      delete process.env.HEALTH_API_KEY;
    } else {
      process.env.HEALTH_API_KEY = originalHealthApiKey;
    }
  });

  it('allows health access when HEALTH_PRIVATE is disabled', () => {
    process.env.HEALTH_PRIVATE = 'false';
    const context = makeContext();
    expect(guard.canActivate(context)).toBe(true);
  });

  it('rejects when HEALTH_PRIVATE is enabled and key is not configured', () => {
    process.env.HEALTH_PRIVATE = 'true';
    const context = makeContext();
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('allows when HEALTH_PRIVATE is enabled and header key matches', () => {
    process.env.HEALTH_PRIVATE = 'true';
    process.env.HEALTH_API_KEY = 'health-secret';
    const context = makeContext('health-secret');
    expect(guard.canActivate(context)).toBe(true);
  });

  it('rejects when HEALTH_PRIVATE is enabled and header key mismatches', () => {
    process.env.HEALTH_PRIVATE = 'true';
    process.env.HEALTH_API_KEY = 'health-secret';
    const context = makeContext('wrong-key');
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });
});

function makeContext(key?: string): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        headers: key ? { 'x-health-key': key } : {},
      }),
    }),
  } as ExecutionContext;
}
