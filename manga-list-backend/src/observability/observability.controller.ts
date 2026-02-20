import { Controller, Get, UseGuards } from '@nestjs/common';
import { ObservabilityService } from './observability.service';
import { MetricsGuard } from './guards/metrics.guard';
import { HealthGuard } from './guards/health.guard';

@Controller()
export class ObservabilityController {
  constructor(private readonly observabilityService: ObservabilityService) {}

  @Get('health')
  @UseGuards(HealthGuard)
  getHealth() {
    return this.observabilityService.getHealth();
  }

  @Get('metrics')
  @UseGuards(MetricsGuard)
  getMetrics() {
    return this.observabilityService.getMetrics();
  }
}
