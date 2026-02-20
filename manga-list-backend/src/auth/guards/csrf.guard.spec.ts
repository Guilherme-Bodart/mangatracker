import { ForbiddenException } from '@nestjs/common';
import { CsrfGuard } from './csrf.guard';

describe('CsrfGuard', () => {
  const authService = {
    validateCsrfToken: jest.fn(),
    validatePreAuthCsrfToken: jest.fn(),
  };

  const createContext = (request: Record<string, unknown>) =>
    ({
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    }) as never;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should reject when csrf cookie is missing', async () => {
    const guard = new CsrfGuard(authService as never);
    const context = createContext({
      headers: {
        'x-csrf-token': 'csrf-1',
        cookie: 'csrf_session=session-1',
      },
    });

    await expect(guard.canActivate(context)).rejects.toThrow(
      ForbiddenException,
    );
    expect(authService.validateCsrfToken).not.toHaveBeenCalled();
    expect(authService.validatePreAuthCsrfToken).not.toHaveBeenCalled();
  });

  it('should reject when csrf header token does not match cookie token', async () => {
    const guard = new CsrfGuard(authService as never);
    const context = createContext({
      headers: {
        'x-csrf-token': 'csrf-header',
        cookie: 'csrf_token=csrf-cookie; csrf_session=session-1',
      },
    });

    await expect(guard.canActivate(context)).rejects.toThrow(
      ForbiddenException,
    );
    expect(authService.validateCsrfToken).not.toHaveBeenCalled();
    expect(authService.validatePreAuthCsrfToken).not.toHaveBeenCalled();
  });

  it('should reject authenticated request when token validation fails', async () => {
    authService.validateCsrfToken.mockResolvedValue(false);
    const guard = new CsrfGuard(authService as never);
    const context = createContext({
      user: { id: 'user-1' },
      headers: {
        'x-csrf-token': 'csrf-ok',
        cookie: 'csrf_token=csrf-ok',
      },
    });

    await expect(guard.canActivate(context)).rejects.toThrow(
      ForbiddenException,
    );
    expect(authService.validateCsrfToken).toHaveBeenCalledWith(
      'user-1',
      'csrf-ok',
    );
  });

  it('should reject pre-auth request when session token validation fails', async () => {
    authService.validatePreAuthCsrfToken.mockResolvedValue(false);
    const guard = new CsrfGuard(authService as never);
    const context = createContext({
      headers: {
        'x-csrf-token': 'csrf-ok',
        cookie: 'csrf_token=csrf-ok; csrf_session=session-1',
      },
    });

    await expect(guard.canActivate(context)).rejects.toThrow(
      ForbiddenException,
    );
    expect(authService.validatePreAuthCsrfToken).toHaveBeenCalledWith(
      'session-1',
      'csrf-ok',
    );
  });

  it('should allow authenticated request when token is valid', async () => {
    authService.validateCsrfToken.mockResolvedValue(true);
    const guard = new CsrfGuard(authService as never);
    const context = createContext({
      user: { id: 'user-1' },
      headers: {
        'x-csrf-token': 'csrf-ok',
        cookie: 'csrf_token=csrf-ok',
      },
    });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(authService.validateCsrfToken).toHaveBeenCalledWith(
      'user-1',
      'csrf-ok',
    );
  });

  it('should allow pre-auth request when token is valid', async () => {
    authService.validatePreAuthCsrfToken.mockResolvedValue(true);
    const guard = new CsrfGuard(authService as never);
    const context = createContext({
      headers: {
        'x-csrf-token': 'csrf-ok',
        cookie: 'csrf_token=csrf-ok; csrf_session=session-1',
      },
    });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(authService.validatePreAuthCsrfToken).toHaveBeenCalledWith(
      'session-1',
      'csrf-ok',
    );
  });
});
