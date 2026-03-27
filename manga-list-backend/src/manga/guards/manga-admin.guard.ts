import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';

type RequestWithUser = Request & {
  user?: {
    id: string;
    email?: string;
  };
};

@Injectable()
export class MangaAdminGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const email = request.user?.email?.trim().toLowerCase();
    if (!request.user?.id || !email) {
      throw new UnauthorizedException('Authenticated admin user not found');
    }

    const rawAllowed =
      this.configService.get<string>('MANGA_ADMIN_EMAILS') ??
      this.configService.get<string>('NOTIFICATION_ADMIN_EMAILS') ??
      this.configService.get<string>('INTEGRATION_ADMIN_EMAILS');

    if (!rawAllowed?.trim()) {
      throw new ForbiddenException('Manga admin list is not configured');
    }

    const allowedEmails = rawAllowed
      .split(',')
      .map((item) => item.trim().toLowerCase())
      .filter((item) => item.length > 0);

    if (!allowedEmails.includes(email)) {
      throw new ForbiddenException('User is not allowed to manage manga admin');
    }

    return true;
  }
}

