import { UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  let service: AuthService;
  const cacheStore = new Map<string, unknown>();

  const prisma = {
    user: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  };

  const jwtService = {
    sign: jest.fn(),
  };

  const cacheManager = {
    get: jest.fn(async (key: string) => cacheStore.get(key)),
    set: jest.fn(async (key: string, value: unknown) => {
      cacheStore.set(key, value);
    }),
    del: jest.fn(async (key: string) => {
      cacheStore.delete(key);
    }),
  };

  const configService = {
    get: jest.fn(),
  };

  const mailService = {
    sendPasswordResetEmail: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    cacheStore.clear();
    configService.get.mockImplementation((key: string) => {
      if (key === 'JWT_SECRET') return 'test-jwt-secret';
      return undefined;
    });
    service = new AuthService(
      prisma as never,
      jwtService as never,
      configService as never,
      mailService as never,
      cacheManager as never,
    );
  });

  it('should reject login for oauth user without password', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'u1',
      email: 'oauth@example.com',
      username: 'oauth-user',
      password: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await expect(
      service.login({ email: 'oauth@example.com', password: 'abc123' }),
    ).rejects.toThrow(UnauthorizedException);
    expect(jwtService.sign).not.toHaveBeenCalled();
  });

  it('should login without exposing password in response payload', async () => {
    const password = 'StrongPass123';
    const hashedPassword = await bcrypt.hash(password, 10);
    const createdAt = new Date();
    const updatedAt = new Date();

    prisma.user.findUnique.mockResolvedValue({
      id: 'u-login',
      username: 'login-user',
      email: 'login@example.com',
      password: hashedPassword,
      tokenVersion: 2,
      allowNsfw: false,
      createdAt,
      updatedAt,
    });
    jwtService.sign.mockReturnValue('jwt-login-token');

    const result = await service.login({
      email: 'login@example.com',
      password,
    });

    expect(jwtService.sign).toHaveBeenCalledWith({ sub: 'u-login', tv: 2 });
    expect(result).toEqual({
      user: {
        id: 'u-login',
        username: 'login-user',
        email: 'login@example.com',
        allowNsfw: false,
        createdAt,
        updatedAt,
      },
      token: 'jwt-login-token',
    });
    expect(result.user).not.toHaveProperty('password');
  });

  it('should require current password when changing password for local account', async () => {
    const oldHash = await bcrypt.hash('old-password-123', 10);
    prisma.user.findUnique.mockResolvedValue({
      id: 'u2',
      password: oldHash,
    });

    await expect(
      service.updateProfile('u2', { password: 'new-password-123' }),
    ).rejects.toThrow('Current password is required');
  });

  it('should reject exchange code when code is invalid or expired', async () => {
    const contextHash = service.buildOAuthContextHash('session-1', 'agent-a');
    const userAgentHash = service.buildUserAgentHash('agent-a');
    const state = await service.createOAuthState(contextHash);

    await expect(
      service.exchangeOAuthCode(
        'invalid-code',
        state,
        contextHash,
        userAgentHash,
      ),
    ).rejects.toThrow(UnauthorizedException);
    expect(cacheManager.del).not.toHaveBeenCalled();
  });

  it('should exchange valid oauth code and return user + token', async () => {
    const contextHash = service.buildOAuthContextHash('session-1', 'agent-a');
    const userAgentHash = service.buildUserAgentHash('agent-a');
    const state = await service.createOAuthState(contextHash);
    const [stateNonce] = state.split('.');

    await cacheManager.set('oauth:code:valid-code', {
      userId: 'user-123',
      contextHash,
      stateNonce,
      userAgentHash,
    });

    prisma.user.findUnique.mockResolvedValue({
      id: 'user-123',
      username: 'guilh',
      email: 'guilh@example.com',
      tokenVersion: 0,
      avatarUrl: null,
      bannerUrl: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    jwtService.sign.mockReturnValue('jwt-token');

    const result = await service.exchangeOAuthCode(
      'valid-code',
      state,
      contextHash,
      userAgentHash,
    );

    expect(cacheManager.del).toHaveBeenCalledWith('oauth:code:valid-code');
    expect(jwtService.sign).toHaveBeenCalledWith({ sub: 'user-123', tv: 0 });
    expect(result).toEqual({
      user: {
        id: 'user-123',
        username: 'guilh',
        email: 'guilh@example.com',
        tokenVersion: 0,
        avatarUrl: null,
        bannerUrl: null,
        createdAt: expect.any(Date) as Date,
        updatedAt: expect.any(Date) as Date,
      },
      token: 'jwt-token',
    });
  });

  it('should reject oauth exchange when context hash does not match', async () => {
    const contextHash = service.buildOAuthContextHash('session-1', 'agent-a');
    const userAgentHash = service.buildUserAgentHash('agent-a');
    const wrongContextHash = service.buildOAuthContextHash(
      'session-2',
      'agent-a',
    );
    const state = await service.createOAuthState(contextHash);
    const [stateNonce] = state.split('.');

    await cacheManager.set('oauth:code:valid-code', {
      userId: 'user-123',
      contextHash,
      stateNonce,
      userAgentHash,
    });

    await expect(
      service.exchangeOAuthCode(
        'valid-code',
        state,
        wrongContextHash,
        userAgentHash,
      ),
    ).rejects.toThrow('OAuth exchange context mismatch');
  });

  it('should consume oauth state and reject replay', async () => {
    const contextHash = service.buildOAuthContextHash('session-1', 'agent-a');
    const state = await service.createOAuthState(contextHash);

    await expect(
      service.validateAndConsumeOAuthState(state, contextHash),
    ).resolves.toEqual(
      expect.objectContaining({
        nonce: expect.any(String),
        issuedAt: expect.any(Number),
      }),
    );

    await expect(
      service.validateAndConsumeOAuthState(state, contextHash),
    ).rejects.toThrow('Invalid or expired oauth state');
  });

  it('should create reset token for local account', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'u-reset',
      password: 'hashed-password',
    });
    configService.get.mockImplementation((key: string) => {
      if (key === 'PASSWORD_RESET_DEV_RESPONSE') return 'true';
      if (key === 'JWT_SECRET') return 'test-jwt-secret';
      return undefined;
    });
    mailService.sendPasswordResetEmail.mockResolvedValue(undefined);

    const result = await service.requestPasswordReset('user@example.com');

    expect(result.success).toBe(true);
    expect(result.resetToken).toBeDefined();
    expect(cacheManager.set).toHaveBeenCalled();
    const resetCacheKey = cacheManager.set.mock.calls[0][0] as string;
    expect(resetCacheKey.startsWith('password-reset:')).toBe(true);
    expect(resetCacheKey).not.toContain(result.resetToken as string);
    expect(mailService.sendPasswordResetEmail).toHaveBeenCalled();
  });

  it('should reject reset with invalid token', async () => {
    cacheManager.get.mockResolvedValue(null);

    await expect(
      service.resetPassword('bad-token', 'new-password'),
    ).rejects.toThrow('Invalid or expired reset token');
  });

  it('should block registration when username exists with different casing', async () => {
    prisma.user.findFirst.mockResolvedValue({
      id: 'u-existing',
      username: 'Outrigger',
      email: 'existing@example.com',
    });

    await expect(
      service.register({
        username: 'outrigger',
        email: 'new@example.com',
        password: 'StrongPassword123',
      }),
    ).rejects.toThrow('Username already taken');
  });

  it('should block profile update when target username differs only by casing', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'u-current',
      password: null,
    });
    prisma.user.findFirst.mockResolvedValue({
      id: 'u-other',
      username: 'Outrigger',
      email: 'other@example.com',
    });

    await expect(
      service.updateProfile('u-current', { username: 'outrigger' }),
    ).rejects.toThrow('Username already taken');
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
});
