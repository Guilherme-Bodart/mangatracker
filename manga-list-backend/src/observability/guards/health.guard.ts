import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { timingSafeEqual } from 'crypto';
import { Request } from 'express';

@Injectable()
export class HealthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const isPrivate =
      process.env.HEALTH_PRIVATE?.trim().toLowerCase() === 'true';

    if (!isPrivate) {
      return true;
    }

    const expectedKey = process.env.HEALTH_API_KEY?.trim();
    if (!expectedKey) {
      throw new ForbiddenException('Health endpoint is not configured');
    }

    const provided = this.extractHeaderValue(request.headers['x-health-key']);
    if (!provided) {
      throw new ForbiddenException('Missing health API key');
    }

    if (!safeEquals(provided, expectedKey)) {
      throw new ForbiddenException('Invalid health API key');
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
