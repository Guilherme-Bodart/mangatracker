import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';

type IntegrationTokenPayload = {
  sub: string;
  pid: string;
  psl: string;
  scp: string[];
  typ: 'integration';
  exp?: number;
};

type RequestWithIntegrationAuth = Request & {
  integrationAuth?: {
    userId: string;
    partnerId: string;
    partnerSlug: string;
    scopes: string[];
    tokenExpiresAt?: string;
  };
};

@Injectable()
export class IntegrationTokenGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context
      .switchToHttp()
      .getRequest<RequestWithIntegrationAuth>();
    const token = this.extractBearerToken(request);

    if (!token) {
      throw new UnauthorizedException('Missing integration access token');
    }

    const secret =
      this.configService.get<string>('INTEGRATION_JWT_SECRET') ??
      this.configService.get<string>('JWT_SECRET');
    if (!secret) {
      throw new UnauthorizedException('Integration token secret is not configured');
    }

    let payload: IntegrationTokenPayload;
    try {
      payload = this.jwtService.verify<IntegrationTokenPayload>(token, {
        secret,
      });
    } catch {
      throw new UnauthorizedException('Invalid integration access token');
    }

    if (
      payload.typ !== 'integration' ||
      !payload.sub ||
      !payload.pid ||
      !payload.psl ||
      !Array.isArray(payload.scp)
    ) {
      throw new UnauthorizedException('Invalid integration token payload');
    }

    request.integrationAuth = {
      userId: payload.sub,
      partnerId: payload.pid,
      partnerSlug: payload.psl,
      scopes: payload.scp,
      tokenExpiresAt: this.resolveTokenExpiresAt(payload.exp),
    };
    return true;
  }

  private extractBearerToken(request: Request): string | null {
    const authHeader = request.headers.authorization;
    if (!authHeader) {
      return null;
    }

    const [type, token] = authHeader.split(' ');
    if (type !== 'Bearer' || !token) {
      return null;
    }

    return token;
  }

  private resolveTokenExpiresAt(exp?: number): string | undefined {
    if (!exp || !Number.isFinite(exp) || exp <= 0) {
      return undefined;
    }
    return new Date(exp * 1000).toISOString();
  }
}
