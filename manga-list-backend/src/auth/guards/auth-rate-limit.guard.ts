import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';

type RateLimitConfig = {
  maxAttempts: number;
  windowMs: number;
};

@Injectable()
export class AuthRateLimitGuard implements CanActivate {
  private static readonly METRICS_TTL_MS = 24 * 60 * 60 * 1000;

  constructor(@Inject(CACHE_MANAGER) private cacheManager: Cache) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<
        Request & { user?: { id?: string }; body?: { email?: string } }
      >();
    const response = context.switchToHttp().getResponse<Response>();
    const routePath = request?.route?.path ?? '';
    const method = request?.method ?? 'GET';
    const ip = this.getClientIp(request);
    const userId = request?.user?.id;
    const email = this.normalizeEmail(request?.body?.email);

    const routeKey = `${method}:${routePath}`;

    const config = this.getRateLimitConfig(routeKey);
    if (!config) {
      return true;
    }

    const now = Date.now();
    const bucket = Math.floor(now / config.windowMs);
    const subjects = this.buildSubjects(ip, userId, email);
    const routeScope = this.sanitizeKey(routeKey);
    const resetAt = (bucket + 1) * config.windowMs;
    const retryAfterSeconds = Math.max(1, Math.ceil((resetAt - now) / 1000));
    const counters = await Promise.all(
      subjects.map(async (subject) => {
        const key = `rate-limit:${routeScope}:${subject}:${bucket}`;
        const current = (await this.cacheManager.get<number>(key)) ?? 0;
        return { key, current };
      }),
    );

    const blocked = counters.find(
      (counter) => counter.current >= config.maxAttempts,
    );
    if (blocked) {
      response.setHeader('Retry-After', retryAfterSeconds.toString());
      response.setHeader('X-RateLimit-Limit', config.maxAttempts.toString());
      response.setHeader('X-RateLimit-Remaining', '0');
      await this.incrementMetric(routeScope, 'blocked');
      throw new HttpException(
        'Too many authentication attempts. Please try again later.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const minCurrent = counters.length
      ? Math.min(...counters.map((counter) => counter.current))
      : 0;
    const remaining = Math.max(0, config.maxAttempts - (minCurrent + 1));
    response.setHeader('X-RateLimit-Limit', config.maxAttempts.toString());
    response.setHeader('X-RateLimit-Remaining', remaining.toString());
    response.setHeader(
      'X-RateLimit-Reset',
      Math.floor(resetAt / 1000).toString(),
    );

    await Promise.all(
      counters.map((counter) =>
        this.cacheManager.set(
          counter.key,
          counter.current + 1,
          config.windowMs,
        ),
      ),
    );
    await this.incrementMetric(routeScope, 'allowed');
    return true;
  }

  private buildSubjects(ip: string, userId?: string, email?: string): string[] {
    const subjects = [`ip:${this.sanitizeKey(ip)}`];
    if (userId) {
      subjects.push(`user:${this.sanitizeKey(userId)}`);
    } else if (email) {
      subjects.push(`email:${this.sanitizeKey(email)}`);
    }
    return subjects;
  }

  private getClientIp(request: Request): string {
    const forwardedFor = request.headers['x-forwarded-for'];
    if (typeof forwardedFor === 'string') {
      const firstIp = forwardedFor.split(',')[0]?.trim();
      if (firstIp) return firstIp;
    }
    return request.ip ?? request.socket?.remoteAddress ?? 'unknown';
  }

  private normalizeEmail(email?: string): string | undefined {
    if (!email || typeof email !== 'string') return undefined;
    const normalized = email.trim().toLowerCase();
    return normalized || undefined;
  }

  private sanitizeKey(value: string): string {
    return value.replace(/[^a-zA-Z0-9:_-]/g, '_');
  }

  private async incrementMetric(
    routeScope: string,
    type: 'allowed' | 'blocked',
  ): Promise<void> {
    const metricKey = `rate-limit:metrics:${routeScope}:${type}`;
    const current = (await this.cacheManager.get<number>(metricKey)) ?? 0;
    await this.cacheManager.set(
      metricKey,
      current + 1,
      AuthRateLimitGuard.METRICS_TTL_MS,
    );
  }

  private getRateLimitConfig(routeKey: string): RateLimitConfig | null {
    const isLogin =
      routeKey === 'POST:login' ||
      routeKey === 'POST:/login' ||
      routeKey.endsWith(':/auth/login');
    const isRegister =
      routeKey === 'POST:register' ||
      routeKey === 'POST:/register' ||
      routeKey.endsWith(':/auth/register');
    const isRefresh =
      routeKey === 'GET:refresh' ||
      routeKey === 'GET:/refresh' ||
      routeKey.endsWith(':/auth/refresh');
    const isForgotPassword =
      routeKey === 'POST:forgot-password' ||
      routeKey === 'POST:/forgot-password' ||
      routeKey.endsWith(':/auth/forgot-password');
    const isResetPassword =
      routeKey === 'POST:reset-password' ||
      routeKey === 'POST:/reset-password' ||
      routeKey.endsWith(':/auth/reset-password');

    if (isLogin || isRegister) {
      return { maxAttempts: 10, windowMs: 15 * 60 * 1000 };
    }

    if (isRefresh) {
      return { maxAttempts: 30, windowMs: 15 * 60 * 1000 };
    }

    if (isForgotPassword || isResetPassword) {
      return { maxAttempts: 8, windowMs: 15 * 60 * 1000 };
    }

    return null;
  }
}
