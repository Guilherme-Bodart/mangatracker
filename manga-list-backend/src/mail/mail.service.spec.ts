import { Logger } from '@nestjs/common';
import { MailService } from './mail.service';

describe('MailService', () => {
  const configValues = new Map<string, string>();

  const configService = {
    get: jest.fn((key: string) => configValues.get(key)),
  };

  let service: MailService;
  let logSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    configValues.clear();
    service = new MailService(configService as never);
    logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
  });

  afterEach(() => {
    logSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it('redacts reset link logging outside local controlled environment', async () => {
    configValues.set('MAIL_PROVIDER', 'log');
    configValues.set('NODE_ENV', 'production');
    configValues.set('PASSWORD_RESET_DEV_RESPONSE', 'false');

    await service.sendPasswordResetEmail(
      'user@example.com',
      'https://app.test/auth/reset-password?token=secret-token',
    );

    expect(logSpy).toHaveBeenCalledWith(
      'MAIL_PROVIDER=log - password reset requested (link redacted)',
    );
    expect(logSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('secret-token'),
    );
  });

  it('allows full reset link logging in local controlled environment', async () => {
    configValues.set('MAIL_PROVIDER', 'log');
    configValues.set('NODE_ENV', 'development');
    configValues.set('PASSWORD_RESET_DEV_RESPONSE', 'true');

    await service.sendPasswordResetEmail(
      'user@example.com',
      'http://localhost:3000/auth/reset-password?token=dev-token',
    );

    expect(logSpy).toHaveBeenCalledWith(
      'MAIL_PROVIDER=log - password reset link for user@example.com: http://localhost:3000/auth/reset-password?token=dev-token',
    );
  });

  it('redacts fallback log when smtp config is missing', async () => {
    configValues.set('MAIL_PROVIDER', 'smtp');
    configValues.set('NODE_ENV', 'production');
    configValues.set('PASSWORD_RESET_DEV_RESPONSE', 'false');
    configValues.set('SMTP_PORT', '587');

    await service.sendPasswordResetEmail(
      'user@example.com',
      'https://app.test/auth/reset-password?token=secret-token',
    );

    expect(warnSpy).toHaveBeenCalledWith(
      'SMTP provider selected but SMTP_HOST/SMTP_USER/SMTP_PASS are missing; using log fallback',
    );
    expect(logSpy).toHaveBeenCalledWith(
      'Password reset requested (link redacted)',
    );
    expect(logSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('secret-token'),
    );
  });

  it('redacts secret on integration approval email fallback logs', async () => {
    configValues.set('MAIL_PROVIDER', 'log');

    await service.sendIntegrationApprovedEmail('partner@example.com', {
      partnerName: 'Site A',
      partnerSlug: 'site-a',
      clientSecret: 'super-secret-value',
      docsUrl: 'https://example.com/how-to-use-api',
    });

    expect(logSpy).toHaveBeenCalledWith(
      'MAIL_PROVIDER=log - integration approved email queued for partner@example.com (secret redacted)',
    );
    expect(logSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('super-secret-value'),
    );
  });
});
