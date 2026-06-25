import {
  BadRequestException,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Request } from 'express';

@Injectable()
export class GoogleAuthGuard extends AuthGuard('google') {
  getAuthenticateOptions(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<Request>();
    const state = request.query?.state;

    if (typeof state !== 'string' || state.length < 16) {
      throw new BadRequestException('Invalid oauth state');
    }

    return { state };
  }
}

@Injectable()
export class GoogleCallbackGuard extends AuthGuard('google') {
  private readonly logger = new Logger(GoogleCallbackGuard.name);

  handleRequest<TUser = unknown>(
    err: unknown,
    user: TUser | false,
    info: unknown,
  ): TUser {
    if (err || !user) {
      const reason = this.resolveFailureReason(err, info);
      this.logger.warn(`Google OAuth callback rejected: ${reason}`);
      throw new UnauthorizedException(`Google OAuth failed: ${reason}`);
    }

    return user;
  }

  private resolveFailureReason(err: unknown, info: unknown): string {
    const errMessage = this.extractMessage(err);
    if (errMessage) {
      return errMessage;
    }

    const infoMessage = this.extractMessage(info);
    if (infoMessage) {
      return infoMessage;
    }

    return 'Google did not return an authenticated profile';
  }

  private extractMessage(value: unknown): string | null {
    if (!value) {
      return null;
    }

    if (value instanceof Error && value.message) {
      return value.message;
    }

    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }

    if (typeof value === 'object') {
      const maybeMessage = (value as { message?: unknown }).message;
      if (typeof maybeMessage === 'string' && maybeMessage.trim()) {
        return maybeMessage.trim();
      }
    }

    return null;
  }
}
