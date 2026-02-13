import { UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  let service: AuthService;

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
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
  };

  const configService = {
    get: jest.fn(),
  };

  const mailService = {
    sendPasswordResetEmail: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
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
    cacheManager.get.mockResolvedValue(null);

    await expect(service.exchangeOAuthCode('invalid-code')).rejects.toThrow(
      UnauthorizedException,
    );
    expect(cacheManager.del).not.toHaveBeenCalled();
  });

  it('should exchange valid oauth code and return user + token', async () => {
    cacheManager.get.mockResolvedValue('user-123');
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

    const result = await service.exchangeOAuthCode('valid-code');

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

  it('should create reset token for local account', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'u-reset',
      password: 'hashed-password',
    });
    configService.get.mockReturnValue('true');
    mailService.sendPasswordResetEmail.mockResolvedValue(undefined);

    const result = await service.requestPasswordReset('user@example.com');

    expect(result.success).toBe(true);
    expect(result.resetToken).toBeDefined();
    expect(cacheManager.set).toHaveBeenCalled();
    expect(mailService.sendPasswordResetEmail).toHaveBeenCalled();
  });

  it('should reject reset with invalid token', async () => {
    cacheManager.get.mockResolvedValue(null);

    await expect(
      service.resetPassword('bad-token', 'new-password'),
    ).rejects.toThrow('Invalid or expired reset token');
  });
});
