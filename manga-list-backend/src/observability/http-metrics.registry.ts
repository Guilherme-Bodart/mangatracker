type RouteMetricBucket = {
  requests: number;
  errors: number;
  totalDurationMs: number;
  maxDurationMs: number;
};

type RouteMetricSnapshot = RouteMetricBucket & {
  avgDurationMs: number;
};

type HttpMetricsSnapshot = {
  startedAt: string;
  totalRequests: number;
  totalErrors: number;
  routes: Record<string, RouteMetricSnapshot>;
};

const metricsState: {
  startedAtMs: number;
  totalRequests: number;
  totalErrors: number;
  routes: Map<string, RouteMetricBucket>;
} = {
  startedAtMs: Date.now(),
  totalRequests: 0,
  totalErrors: 0,
  routes: new Map<string, RouteMetricBucket>(),
};

export function recordHttpMetric(
  method: string,
  path: string,
  statusCode: number,
  durationMs: number,
): void {
  const normalizedPath = normalizePath(path);
  const routeKey = `${method.toUpperCase()} ${normalizedPath}`;

  metricsState.totalRequests += 1;
  if (statusCode >= 400) {
    metricsState.totalErrors += 1;
  }

  const existing = metricsState.routes.get(routeKey) ?? {
    requests: 0,
    errors: 0,
    totalDurationMs: 0,
    maxDurationMs: 0,
  };

  existing.requests += 1;
  if (statusCode >= 400) {
    existing.errors += 1;
  }
  existing.totalDurationMs += Math.max(0, durationMs);
  existing.maxDurationMs = Math.max(existing.maxDurationMs, durationMs);

  metricsState.routes.set(routeKey, existing);
}

export function getHttpMetricsSnapshot(): HttpMetricsSnapshot {
  const routes: Record<string, RouteMetricSnapshot> = {};

  for (const [routeKey, bucket] of metricsState.routes.entries()) {
    routes[routeKey] = {
      ...bucket,
      avgDurationMs:
        bucket.requests > 0 ? bucket.totalDurationMs / bucket.requests : 0,
    };
  }

  return {
    startedAt: new Date(metricsState.startedAtMs).toISOString(),
    totalRequests: metricsState.totalRequests,
    totalErrors: metricsState.totalErrors,
    routes,
  };
}

export function resetHttpMetricsForTests(): void {
  metricsState.startedAtMs = Date.now();
  metricsState.totalRequests = 0;
  metricsState.totalErrors = 0;
  metricsState.routes.clear();
}

function normalizePath(path: string): string {
  const trimmed = path?.trim();
  if (!trimmed) return '/';
  const withoutQuery = trimmed.split('?')[0];
  return withoutQuery || '/';
}
