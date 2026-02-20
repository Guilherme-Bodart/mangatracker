import { Module } from '@nestjs/common';
import { ObservabilityController } from './observability.controller';
import { ObservabilityService } from './observability.service';
import { MetricsGuard } from './guards/metrics.guard';
import { HealthGuard } from './guards/health.guard';

@Module({
  controllers: [ObservabilityController],
  providers: [ObservabilityService, MetricsGuard, HealthGuard],
})
export class ObservabilityModule {}
