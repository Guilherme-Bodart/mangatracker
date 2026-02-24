import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { AuthModule } from '../auth/auth.module';
import { IntegrationsController } from './integrations.controller';
import { IntegrationAdminGuard } from './guards/integration-admin.guard';
import { IntegrationRateLimitGuard } from './guards/integration-rate-limit.guard';
import { IntegrationTokenGuard } from './guards/integration-token.guard';
import { IntegrationsService } from './integrations.service';

@Module({
  imports: [
    AuthModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        secret:
          configService.get<string>('INTEGRATION_JWT_SECRET') ??
          configService.get<string>('JWT_SECRET'),
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [IntegrationsController],
  providers: [
    IntegrationsService,
    IntegrationTokenGuard,
    IntegrationAdminGuard,
    IntegrationRateLimitGuard,
  ],
})
export class IntegrationsModule {}
