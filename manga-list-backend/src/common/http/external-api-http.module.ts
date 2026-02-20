import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ExternalApiHttpClient } from './external-api-client';

@Module({
  providers: [
    {
      provide: ExternalApiHttpClient,
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const parseEnvInt = (value: string | undefined, fallback: number) => {
          const parsed = Number(value);
          return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
        };

        return new ExternalApiHttpClient({
          timeoutMs: parseEnvInt(
            configService.get<string>('EXTERNAL_API_TIMEOUT_MS'),
            10000,
          ),
          retries: parseEnvInt(
            configService.get<string>('EXTERNAL_API_RETRIES'),
            2,
          ),
          failureThreshold: parseEnvInt(
            configService.get<string>('EXTERNAL_API_CIRCUIT_FAILURE_THRESHOLD'),
            5,
          ),
          cooldownMs: parseEnvInt(
            configService.get<string>('EXTERNAL_API_CIRCUIT_COOLDOWN_MS'),
            30000,
          ),
        });
      },
    },
  ],
  exports: [ExternalApiHttpClient],
})
export class ExternalApiHttpModule {}
