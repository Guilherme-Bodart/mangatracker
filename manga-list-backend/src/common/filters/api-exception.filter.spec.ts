import {
  BadRequestException,
  HttpException,
  HttpStatus,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiExceptionFilter } from './api-exception.filter';

describe('ApiExceptionFilter', () => {
  const createHost = (url = '/auth/login', acceptLanguage = 'en') => {
    const status = jest.fn().mockReturnThis();
    const json = jest.fn();
    const redirect = jest.fn();

    const response = { status, json, redirect };
    const request = {
      method: 'POST',
      url,
      path: url.split('?')[0],
      headers: { 'accept-language': acceptLanguage },
    };

    const host = {
      switchToHttp: () => ({
        getResponse: () => response,
        getRequest: () => request,
      }),
    };

    return { host, response };
  };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.NODE_ENV = 'test';
    delete process.env.FRONTEND_URL;
  });

  it('should serialize UnauthorizedException', () => {
    const filter = new ApiExceptionFilter();
    const { host, response } = createHost();

    filter.catch(
      new UnauthorizedException('Invalid credentials'),
      host as never,
    );

    expect(response.status).toHaveBeenCalledWith(HttpStatus.UNAUTHORIZED);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'UNAUTHORIZED',
        message: 'Invalid credentials',
        path: '/auth/login',
      }),
    );
  });

  it('should serialize validation errors into details', () => {
    const filter = new ApiExceptionFilter();
    const { host, response } = createHost('/auth/register');
    const exception = new BadRequestException(['email must be an email']);

    filter.catch(exception, host as never);

    expect(response.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'BAD_REQUEST',
        message: 'Validation failed',
        details: { validationErrors: ['email must be an email'] },
      }),
    );
  });

  it('should serialize custom code from HttpException response body', () => {
    const filter = new ApiExceptionFilter();
    const { host, response } = createHost('/auth/refresh');
    const exception = new HttpException(
      { code: 'AUTH_RATE_LIMIT', message: 'Too many attempts' },
      HttpStatus.TOO_MANY_REQUESTS,
    );

    filter.catch(exception, host as never);

    expect(response.status).toHaveBeenCalledWith(HttpStatus.TOO_MANY_REQUESTS);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'AUTH_RATE_LIMIT',
        message: 'Too many attempts',
      }),
    );
  });

  it('should translate message to portuguese when Accept-Language is pt-BR', () => {
    const filter = new ApiExceptionFilter();
    const { host, response } = createHost('/auth/login', 'pt-BR,pt;q=0.9');

    filter.catch(
      new UnauthorizedException('Invalid credentials'),
      host as never,
    );

    expect(response.status).toHaveBeenCalledWith(HttpStatus.UNAUTHORIZED);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'UNAUTHORIZED',
        message: 'Credenciais inválidas',
      }),
    );
  });

  it('should redirect google callback failures to frontend callback page', () => {
    process.env.FRONTEND_URL = 'https://mangastracker.vercel.app';
    const filter = new ApiExceptionFilter();
    const { host, response } = createHost(
      '/auth/google/callback?state=abc',
      'pt-BR,pt;q=0.9',
    );

    filter.catch(
      new UnauthorizedException('Invalid or expired oauth state'),
      host as never,
    );

    expect(response.redirect).toHaveBeenCalledWith(
      expect.stringMatching(
        /^https:\/\/mangastracker\.vercel\.app\/auth\/callback\?/,
      ),
    );
    const redirectUrl = response.redirect.mock.calls[0][0] as string;
    expect(redirectUrl).toContain('error=oauth_callback_failed');
    expect(redirectUrl).toContain('code=UNAUTHORIZED');
    expect(response.status).not.toHaveBeenCalled();
    expect(response.json).not.toHaveBeenCalled();
  });
});
