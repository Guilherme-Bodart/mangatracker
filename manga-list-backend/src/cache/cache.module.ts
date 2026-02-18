import { Module, Global } from '@nestjs/common';
import { CacheModule as NestCacheModule } from '@nestjs/cache-manager';
import * as redisStore from 'cache-manager-redis-store';

function getRedisConnectionOptions() {
  const redisUrl = process.env.REDIS_URL?.trim();
  if (redisUrl) {
    return { url: redisUrl };
  }

  return {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
  };
}

@Global()
@Module({
  imports: [
    NestCacheModule.register({
      isGlobal: true,
      store: redisStore,
      ttl: 60 * 60 * 24 * 1000, // 24 hours default caching (milliseconds)
      ...getRedisConnectionOptions(),
    }),
  ],
  exports: [NestCacheModule],
})
export class CacheModule {}
