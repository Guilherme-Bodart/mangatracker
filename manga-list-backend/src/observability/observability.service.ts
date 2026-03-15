import { Injectable } from '@nestjs/common';
import { getHttpMetricsSnapshot } from './http-metrics.registry';
import { getIntegrationMetricsSnapshot } from './integration-metrics.registry';

@Injectable()
export class ObservabilityService {
  getHealth() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      environment: process.env.NODE_ENV ?? 'development',
    };
  }

  getMetrics() {
    const memoryUsage = process.memoryUsage();
    return {
      process: {
        uptimeSeconds: Math.floor(process.uptime()),
        memoryRssBytes: memoryUsage.rss,
        memoryHeapUsedBytes: memoryUsage.heapUsed,
        memoryHeapTotalBytes: memoryUsage.heapTotal,
      },
      http: getHttpMetricsSnapshot(),
      integrations: getIntegrationMetricsSnapshot(),
    };
  }
}
