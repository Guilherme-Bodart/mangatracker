import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { timingSafeEqual } from 'crypto';
import { Request } from 'express';

@Injectable()
export class MetricsGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const expectedKey = process.env.METRICS_API_KEY?.trim();
    const nodeEnv = process.env.NODE_ENV ?? 'development';

    if (!expectedKey) {
      // Keep local/test ergonomics, but fail closed in production.
      if (nodeEnv === 'production') {
        throw new ForbiddenException('Metrics endpoint is not configured');
      }
      return true;
    }

    const provided = this.extractHeaderValue(request.headers['x-metrics-key']);
    if (!provided) {
      throw new ForbiddenException('Missing metrics API key');
    }

    if (!safeEquals(provided, expectedKey)) {
      throw new ForbiddenException('Invalid metrics API key');
    }

    return true;
  }

  private extractHeaderValue(
    raw: string | string[] | undefined,
  ): string | null {
    if (typeof raw === 'string') {
      const trimmed = raw.trim();
      return trimmed.length > 0 ? trimmed : null;
    }
    if (Array.isArray(raw) && raw[0]) {
      const trimmed = raw[0].trim();
      return trimmed.length > 0 ? trimmed : null;
    }
    return null;
  }
}

function safeEquals(a: string, b: string): boolean {
  const aBuffer = Buffer.from(a);
  const bBuffer = Buffer.from(b);

  if (aBuffer.length !== bBuffer.length) {
    return false;
  }

  return timingSafeEqual(aBuffer, bBuffer);
}
