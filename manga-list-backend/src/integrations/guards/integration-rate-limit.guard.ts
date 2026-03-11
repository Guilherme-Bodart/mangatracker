import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
} from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { Request, Response } from 'express';
import { CACHE_TTL_MS } from '../../cache/cache-ttl.constants';

type IntegrationRequest = Request & {
  integrationAuth?: {
    userId: string;
    partnerId: string;
    partnerSlug: string;
    scopes: string[];
  };
  body?: {
    partnerSlug?: string;
  };
};

type IntegrationRateLimitConfig = {
  maxAttempts: number;
  windowMs: number;
};

@Injectable()
export class IntegrationRateLimitGuard implements CanActivate {
  constructor(@Inject(CACHE_MANAGER) private readonly cacheManager: Cache) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<IntegrationRequest>();
    const response = context.switchToHttp().getResponse<Response>();
    const routeKey = `${request.method}:${request.route?.path ?? ''}`;
    const config = this.getConfig(routeKey);
    if (!config) {
      return true;
    }

    const now = Date.now();
    const bucket = Math.floor(now / config.windowMs);
    const resetAt = (bucket + 1) * config.windowMs;
    const retryAfterSeconds = Math.max(1, Math.ceil((resetAt - now) / 1000));

    const subject = this.resolveSubject(request);
    const key = `integrations:rate-limit:${this.sanitizeKey(routeKey)}:${subject}:${bucket}`;
    const current = (await this.cacheManager.get<number>(key)) ?? 0;
    if (current >= config.maxAttempts) {
      response.setHeader('Retry-After', retryAfterSeconds.toString());
      response.setHeader('X-RateLimit-Limit', config.maxAttempts.toString());
      response.setHeader('X-RateLimit-Remaining', '0');
      throw new HttpException(
        'Too many integration requests. Please try again later.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    await this.cacheManager.set(key, current + 1, config.windowMs);
    response.setHeader('X-RateLimit-Limit', config.maxAttempts.toString());
    response.setHeader(
      'X-RateLimit-Remaining',
      Math.max(0, config.maxAttempts - (current + 1)).toString(),
    );
    response.setHeader('X-RateLimit-Reset', Math.floor(resetAt / 1000).toString());
    return true;
  }

  private resolveSubject(request: IntegrationRequest): string {
    if (request.integrationAuth?.partnerId && request.integrationAuth?.userId) {
      return `p:${this.sanitizeKey(request.integrationAuth.partnerId)}:u:${this.sanitizeKey(request.integrationAuth.userId)}`;
    }

    const partnerSlug = request.body?.partnerSlug?.trim().toLowerCase();
    const ip = this.normalizeIp(
      request.ip ?? request.socket?.remoteAddress ?? 'unknown',
    );
    if (partnerSlug) {
      return `slug:${this.sanitizeKey(partnerSlug)}:ip:${this.sanitizeKey(ip)}`;
    }

    return `ip:${this.sanitizeKey(ip)}`;
  }

  private getConfig(routeKey: string): IntegrationRateLimitConfig | null {
    const isExchange =
      routeKey === 'POST:connect/exchange' ||
      routeKey === 'POST:/connect/exchange';
    const isSync = routeKey === 'POST:sync' || routeKey === 'POST:/sync';
    const isPublicApply =
      routeKey === 'POST:public/apply' || routeKey === 'POST:/public/apply';

    if (isPublicApply) {
      return {
        maxAttempts: 5,
        windowMs: CACHE_TTL_MS.AUTH_RATE_LIMIT_WINDOW,
      };
    }

    if (isExchange) {
      return {
        maxAttempts: 20,
        windowMs: CACHE_TTL_MS.INTEGRATION_RATE_LIMIT_WINDOW,
      };
    }

    if (isSync) {
      return {
        maxAttempts: 120,
        windowMs: CACHE_TTL_MS.INTEGRATION_RATE_LIMIT_WINDOW,
      };
    }

    return null;
  }

  private normalizeIp(ip: string): string {
    const normalized = ip.trim();
    if (normalized.startsWith('::ffff:')) {
      return normalized.slice(7);
    }
    return normalized;
  }

  private sanitizeKey(value: string): string {
    return value.replace(/[^a-zA-Z0-9:_-]/g, '_');
  }
}
