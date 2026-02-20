import { AuthController } from './auth.controller';

describe('AuthController', () => {
  const authService = {
    register: jest.fn(),
    login: jest.fn(),
    exchangeOAuthCode: jest.fn(),
    generateToken: jest.fn(),
    updateProfile: jest.fn(),
    validateGoogleUser: jest.fn(),
    createOAuthExchangeCode: jest.fn(),
    getOrCreateCsrfToken: jest.fn(),
    clearPreAuthCsrfToken: jest.fn(),
    clearCsrfToken: jest.fn(),
  };

  const configService = {
    get: jest.fn((key: string) => {
      if (key === 'COOKIE_SECURE') return 'false';
      if (key === 'COOKIE_SAMESITE') return 'lax';
      if (key === 'NODE_ENV') return 'development';
      return undefined;
    }),
  };

  const controller = new AuthController(
    authService as never,
    configService as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should set auth cookie on login', async () => {
    const res = {
      cookie: jest.fn(),
      clearCookie: jest.fn(),
    };
    authService.login.mockResolvedValue({
      user: { id: 'u1' },
      token: 'jwt-token',
    });
    authService.getOrCreateCsrfToken.mockResolvedValue('csrf-token');

    const result = await controller.login(
      { headers: { cookie: 'csrf_session=session-1' } } as never,
      { email: 'g@example.com', password: '123456' },
      res as never,
    );

    expect(res.cookie).toHaveBeenCalledWith(
      'auth_token',
      'jwt-token',
      expect.objectContaining({
        httpOnly: true,
        secure: false,
        sameSite: 'lax',
      }),
    );
    expect(res.cookie).toHaveBeenCalledWith(
      'csrf_token',
      'csrf-token',
      expect.objectContaining({
        httpOnly: false,
        secure: false,
        sameSite: 'lax',
      }),
    );
    expect(authService.clearPreAuthCsrfToken).toHaveBeenCalledWith('session-1');
    expect(res.clearCookie).toHaveBeenCalledWith(
      'csrf_session',
      expect.objectContaining({
        httpOnly: true,
        secure: false,
        sameSite: 'lax',
      }),
    );
    expect(result).toEqual({ user: { id: 'u1' }, csrfToken: 'csrf-token' });
  });

  it('should clear auth cookie on logout', async () => {
    const res = {
      clearCookie: jest.fn(),
    };
    const req = {
      user: { id: 'u1' },
    };

    const result = await controller.logout(req as never, res as never);

    expect(res.clearCookie).toHaveBeenCalledWith(
      'auth_token',
      expect.objectContaining({
        httpOnly: true,
        secure: false,
        sameSite: 'lax',
      }),
    );
    expect(res.clearCookie).toHaveBeenCalledWith(
      'csrf_token',
      expect.objectContaining({
        httpOnly: false,
        secure: false,
        sameSite: 'lax',
      }),
    );
    expect(authService.clearCsrfToken).toHaveBeenCalledWith('u1');
    expect(result).toEqual({ success: true });
  });
});
