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

    const response = { status, json };
    const request = {
      method: 'POST',
      url,
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
});
