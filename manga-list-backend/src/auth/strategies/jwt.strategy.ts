import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Request } from 'express';
import { AuthService } from '../auth.service';

type JwtPayload = {
  sub: string;
  tv: number;
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private configService: ConfigService,
    private authService: AuthService,
  ) {
    const jwtSecret = configService.get<string>('JWT_SECRET');
    if (!jwtSecret) {
      throw new Error('JWT_SECRET is required');
    }

    const cookieExtractor = (request: Request): string | null => {
      const cookieHeader = request?.headers?.cookie;
      if (!cookieHeader) return null;

      const cookies = cookieHeader.split(';');
      for (const cookie of cookies) {
        const [rawName, ...rawValue] = cookie.trim().split('=');
        if (rawName === 'auth_token') {
          const value = rawValue.join('=');
          return value ? decodeURIComponent(value) : null;
        }
      }

      return null;
    };

    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        cookieExtractor,
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      ignoreExpiration: false,
      secretOrKey: jwtSecret,
    });
  }

  async validate(payload: JwtPayload) {
    await this.authService.validateUserTokenVersion(payload.sub, payload.tv);
    return this.authService.validateUser(payload.sub);
  }
}
