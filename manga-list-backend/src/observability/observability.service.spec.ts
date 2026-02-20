import { ObservabilityService } from './observability.service';
import {
  recordHttpMetric,
  resetHttpMetricsForTests,
} from './http-metrics.registry';

describe('ObservabilityService', () => {
  let service: ObservabilityService;

  beforeEach(() => {
    resetHttpMetricsForTests();
    service = new ObservabilityService();
  });

  it('returns health payload', () => {
    const health = service.getHealth();

    expect(health.status).toBe('ok');
    expect(health.timestamp).toBeDefined();
    expect(health.uptimeSeconds).toBeGreaterThanOrEqual(0);
  });

  it('returns aggregated HTTP metrics', () => {
    recordHttpMetric('GET', '/health', 200, 20);
    recordHttpMetric('POST', '/auth/login?x=1', 401, 15);

    const metrics = service.getMetrics();
    expect(metrics.http.totalRequests).toBe(2);
    expect(metrics.http.totalErrors).toBe(1);
    expect(metrics.http.routes['GET /health']).toEqual(
      expect.objectContaining({
        requests: 1,
        errors: 0,
      }),
    );
    expect(metrics.http.routes['POST /auth/login']).toEqual(
      expect.objectContaining({
        requests: 1,
        errors: 1,
      }),
    );
  });
});
