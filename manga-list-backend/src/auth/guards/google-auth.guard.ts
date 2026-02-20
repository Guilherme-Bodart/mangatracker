import {
  BadRequestException,
  ExecutionContext,
  Injectable,
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
