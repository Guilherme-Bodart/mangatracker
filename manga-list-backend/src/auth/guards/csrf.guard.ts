import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Request } from 'express';
import { AuthService } from '../auth.service';

@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(private authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: { id: string } }>();
    const userId = request.user?.id;

    const cookieToken = this.readCookie(request, 'csrf_token');
    const sessionId = this.readCookie(request, 'csrf_session');
    const headerTokenRaw = request.headers['x-csrf-token'];
    const headerToken = Array.isArray(headerTokenRaw)
      ? headerTokenRaw[0]
      : headerTokenRaw;

    if (!cookieToken || !headerToken || cookieToken !== headerToken) {
      throw new ForbiddenException('Invalid CSRF token');
    }

    let isValid = false;
    if (userId) {
      isValid = await this.authService.validateCsrfToken(userId, headerToken);
    } else if (sessionId) {
      isValid = await this.authService.validatePreAuthCsrfToken(
        sessionId,
        headerToken,
      );
    }

    if (!isValid) {
      throw new ForbiddenException('Invalid CSRF token');
    }

    return true;
  }

  private readCookie(request: Request, name: string): string | null {
    const cookieHeader = request.headers.cookie;
    if (!cookieHeader) return null;

    const cookies = cookieHeader.split(';');
    for (const cookie of cookies) {
      const [rawName, ...rawValue] = cookie.trim().split('=');
      if (rawName === name) {
        const value = rawValue.join('=');
        return value ? decodeURIComponent(value) : null;
      }
    }

    return null;
  }
}
