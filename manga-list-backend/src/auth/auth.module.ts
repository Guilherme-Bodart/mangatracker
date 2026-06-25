import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { GoogleStrategy } from './strategies/google.strategy';
import { AuthRateLimitGuard } from './guards/auth-rate-limit.guard';
import { CsrfGuard } from './guards/csrf.guard';
import { MailModule } from '../mail/mail.module';
import {
  GoogleAuthGuard,
  GoogleCallbackGuard,
} from './guards/google-auth.guard';

@Module({
  imports: [
    PassportModule,
    MailModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: '7d',
        },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    GoogleStrategy,
    GoogleAuthGuard,
    GoogleCallbackGuard,
    AuthRateLimitGuard,
    CsrfGuard,
  ],
  exports: [AuthService],
})
export class AuthModule {}
