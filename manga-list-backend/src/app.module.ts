import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { config as loadDotenv } from 'dotenv';
import { existsSync } from 'fs';
import { resolve } from 'path';
import { AuthModule } from './auth/auth.module';
import { PrismaModule } from './prisma/prisma.module';
import { MangaModule } from './manga/manga.module';
import { CacheModule } from './cache/cache.module';
import { TasksModule } from './tasks/tasks.module';
import { ObservabilityModule } from './observability/observability.module';
import { IntegrationsModule } from './integrations/integrations.module';
import { NotificationsModule } from './notifications/notifications.module';

const localEnvPath = resolve(process.cwd(), '.env.local');
if (existsSync(localEnvPath)) {
  loadDotenv({ path: localEnvPath, override: false });
}

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local'],
    }),
    ScheduleModule.forRoot(),
    PrismaModule,
    AuthModule,
    MangaModule,
    CacheModule,
    TasksModule,
    ObservabilityModule,
    IntegrationsModule,
    NotificationsModule,
  ],
})
export class AppModule {}
