import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

type ErrorBody = {
  code: string;
  message: string;
  details?: unknown;
  traceId?: string;
  timestamp: string;
  path: string;
};

type HttpExceptionResponse =
  | string
  | {
      message?: string | string[];
      error?: string;
      code?: string;
      [key: string]: unknown;
    };

type SupportedLocale = 'en' | 'pt';

const PT_MESSAGES_BY_CODE: Record<string, string> = {
  BAD_REQUEST: 'Requisição inválida',
  UNAUTHORIZED: 'Não autorizado',
  FORBIDDEN: 'Acesso negado',
  NOT_FOUND: 'Recurso não encontrado',
  CONFLICT: 'Conflito de dados',
  TOO_MANY_REQUESTS: 'Muitas tentativas. Tente novamente mais tarde.',
  INTERNAL_SERVER_ERROR: 'Erro interno do servidor',
  HTTP_ERROR: 'Erro na requisição',
};

const PT_MESSAGE_OVERRIDES: Record<string, string> = {
  Unauthorized: 'Não autorizado',
  'Invalid credentials': 'Credenciais inválidas',
  'This account uses social login. Please sign in with Google.':
    'Esta conta usa login social. Entre com Google.',
  'Current password is required': 'A senha atual é obrigatória',
  'Current password is invalid': 'A senha atual é inválida',
  'Passwords do not match': 'As senhas não coincidem',
  'Invalid or expired exchange code': 'Código de troca inválido ou expirado',
  'Invalid or expired reset token': 'Token de redefinição inválido ou expirado',
  'Validation failed': 'Falha de validação',
  'Too many authentication attempts. Please try again later.':
    'Muitas tentativas de autenticação. Tente novamente mais tarde.',
};

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const traceId = this.resolveTraceId(request);
    const locale = this.resolveLocale(request);

    const { status, code, message, details } = this.parseException(exception);
    const localizedMessage = this.localizeMessage(locale, code, message);

    if (this.shouldRedirectOAuthCallback(request)) {
      response.redirect(
        this.buildOAuthCallbackErrorRedirectUrl(code, localizedMessage),
      );
      return;
    }

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `Unhandled error on ${request.method} ${request.url}: ${localizedMessage}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    const body: ErrorBody = {
      code,
      message: localizedMessage,
      ...(details !== undefined ? { details } : {}),
      ...(traceId ? { traceId } : {}),
      timestamp: new Date().toISOString(),
      path: request.url,
    };

    response.status(status).json(body);
  }

  private shouldRedirectOAuthCallback(request: Request): boolean {
    const path = request.path || request.url || request.originalUrl || '';
    return path.startsWith('/auth/google/callback');
  }

  private buildOAuthCallbackErrorRedirectUrl(
    code: string,
    message: string,
  ): string {
    const frontendUrl = (
      process.env.FRONTEND_URL || 'http://localhost:3000'
    ).replace(/\/$/, '');
    const params = new URLSearchParams({
      error: 'oauth_callback_failed',
      code,
      message,
    });
    return `${frontendUrl}/auth/callback?${params.toString()}`;
  }

  private parseException(exception: unknown): {
    status: number;
    code: string;
    message: string;
    details?: unknown;
  } {
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const raw = exception.getResponse() as HttpExceptionResponse;
      return this.parseHttpException(status, raw);
    }

    if (exception instanceof Error) {
      return {
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Internal server error',
        details:
          process.env.NODE_ENV === 'production'
            ? undefined
            : { error: exception.message },
      };
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Internal server error',
    };
  }

  private parseHttpException(
    status: number,
    raw: HttpExceptionResponse,
  ): {
    status: number;
    code: string;
    message: string;
    details?: unknown;
  } {
    if (typeof raw === 'string') {
      return {
        status,
        code: this.statusToCode(status),
        message: raw,
      };
    }

    const candidateMessage = raw.message;
    const message =
      typeof candidateMessage === 'string'
        ? candidateMessage
        : Array.isArray(candidateMessage)
          ? 'Validation failed'
          : (raw.error ?? this.defaultMessageForStatus(status));

    const baseCode = raw.code ?? this.statusToCode(status);
    const details = this.extractDetails(raw);

    return {
      status,
      code: baseCode,
      message,
      ...(details !== undefined ? { details } : {}),
    };
  }

  private extractDetails(raw: Exclude<HttpExceptionResponse, string>): unknown {
    if (Array.isArray(raw.message)) {
      return { validationErrors: raw.message };
    }

    const details = { ...raw };
    delete details.message;
    delete details.error;
    delete details.code;
    delete details.statusCode;
    return Object.keys(details).length > 0 ? details : undefined;
  }

  private statusToCode(status: number): string {
    switch (status) {
      case HttpStatus.BAD_REQUEST:
        return 'BAD_REQUEST';
      case HttpStatus.UNAUTHORIZED:
        return 'UNAUTHORIZED';
      case HttpStatus.FORBIDDEN:
        return 'FORBIDDEN';
      case HttpStatus.NOT_FOUND:
        return 'NOT_FOUND';
      case HttpStatus.CONFLICT:
        return 'CONFLICT';
      case HttpStatus.TOO_MANY_REQUESTS:
        return 'TOO_MANY_REQUESTS';
      default:
        return status >= HttpStatus.INTERNAL_SERVER_ERROR
          ? 'INTERNAL_SERVER_ERROR'
          : 'HTTP_ERROR';
    }
  }

  private defaultMessageForStatus(status: number): string {
    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      return 'Internal server error';
    }
    return 'Request failed';
  }

  private resolveLocale(request: Request): SupportedLocale {
    const acceptLanguage = request.headers['accept-language'];
    const raw =
      typeof acceptLanguage === 'string'
        ? acceptLanguage
        : Array.isArray(acceptLanguage)
          ? acceptLanguage[0]
          : '';
    return /\bpt\b|pt-/i.test(raw) ? 'pt' : 'en';
  }

  private localizeMessage(
    locale: SupportedLocale,
    code: string,
    message: string,
  ): string {
    if (locale === 'en') {
      return message;
    }

    const direct = PT_MESSAGE_OVERRIDES[message];
    if (direct) {
      return direct;
    }

    return PT_MESSAGES_BY_CODE[code] ?? message;
  }

  private resolveTraceId(request: Request): string | undefined {
    const fromRequest = (request as Request & { traceId?: string }).traceId;
    if (fromRequest) return fromRequest;

    const header = request.headers['x-trace-id'];
    if (typeof header === 'string' && header.trim().length > 0) {
      return header.trim();
    }
    if (Array.isArray(header) && header[0]?.trim()) {
      return header[0].trim();
    }
    return undefined;
  }
}
