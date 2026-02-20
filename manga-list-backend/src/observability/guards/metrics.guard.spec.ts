import { ForbiddenException } from '@nestjs/common';
import { ExecutionContext } from '@nestjs/common/interfaces';
import { MetricsGuard } from './metrics.guard';

describe('MetricsGuard', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalMetricsKey = process.env.METRICS_API_KEY;
  let guard: MetricsGuard;

  beforeEach(() => {
    guard = new MetricsGuard();
    delete process.env.METRICS_API_KEY;
    process.env.NODE_ENV = 'development';
  });

  afterAll(() => {
    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalNodeEnv;
    }

    if (originalMetricsKey === undefined) {
      delete process.env.METRICS_API_KEY;
    } else {
      process.env.METRICS_API_KEY = originalMetricsKey;
    }
  });

  it('allows metrics access in development when key is not configured', () => {
    const context = makeContext();
    expect(guard.canActivate(context)).toBe(true);
  });

  it('rejects metrics access in production when key is missing', () => {
    process.env.NODE_ENV = 'production';
    const context = makeContext();
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('allows metrics access when key matches header', () => {
    process.env.NODE_ENV = 'production';
    process.env.METRICS_API_KEY = 'metrics-secret';
    const context = makeContext('metrics-secret');
    expect(guard.canActivate(context)).toBe(true);
  });

  it('rejects metrics access when key does not match', () => {
    process.env.NODE_ENV = 'production';
    process.env.METRICS_API_KEY = 'metrics-secret';
    const context = makeContext('wrong-secret');
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });
});

function makeContext(key?: string): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        headers: key ? { 'x-metrics-key': key } : {},
      }),
    }),
  } as ExecutionContext;
}
