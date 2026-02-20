import { Module, Global } from '@nestjs/common';
import {
  CacheModule as NestCacheModule,
  CacheModuleOptions,
} from '@nestjs/cache-manager';
import { createKeyv as createKeyvRedis } from '@keyv/redis';
import { CACHE_TTL_MS } from './cache-ttl.constants';

function isTruthy(value: string | undefined): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === 'true' || normalized === '1' || normalized === 'yes';
}

function getRedisConnectionString(): string {
  const redisUrl = process.env.REDIS_URL?.trim();
  if (redisUrl) {
    return redisUrl;
  }

  const host = process.env.REDIS_HOST?.trim() || 'localhost';
  const port = parseInt(process.env.REDIS_PORT || '6379', 10);
  const username = process.env.REDIS_USERNAME?.trim();
  const password = process.env.REDIS_PASSWORD?.trim();
  const db = process.env.REDIS_DB?.trim();
  const protocol = isTruthy(process.env.REDIS_TLS) ? 'rediss' : 'redis';

  let authSegment = '';
  if (username || password) {
    const encodedUsername = encodeURIComponent(username ?? '');
    const encodedPassword = encodeURIComponent(password ?? '');
    authSegment = `${encodedUsername}:${encodedPassword}@`;
  }

  const dbSegment = db ? `/${db}` : '';
  return `${protocol}://${authSegment}${host}:${port}${dbSegment}`;
}

function shouldUseMemoryStore(): boolean {
  const configuredDriver = process.env.CACHE_DRIVER?.trim().toLowerCase();
  if (configuredDriver === 'memory') return true;
  if (configuredDriver === 'redis') return false;
  return process.env.NODE_ENV === 'test';
}

@Global()
@Module({
  imports: [
    NestCacheModule.registerAsync({
      isGlobal: true,
      useFactory: async (): Promise<CacheModuleOptions> => ({
        ...(shouldUseMemoryStore()
          ? {
              ttl: CACHE_TTL_MS.DEFAULT,
            }
          : {
              ttl: CACHE_TTL_MS.DEFAULT,
              stores: [createKeyvRedis(getRedisConnectionString())],
            }),
      }),
    }),
  ],
  exports: [NestCacheModule],
})
export class CacheModule {}
