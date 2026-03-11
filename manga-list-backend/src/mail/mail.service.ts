import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(private readonly configService: ConfigService) {}

  async sendPasswordResetEmail(email: string, resetUrl: string): Promise<void> {
    const provider =
      this.configService.get<string>('MAIL_PROVIDER')?.toLowerCase() ?? 'log';
    const allowSensitiveLogging = this.shouldLogResetLink();

    if (provider !== 'smtp') {
      if (allowSensitiveLogging) {
        this.logger.log(
          `MAIL_PROVIDER=${provider} - password reset link for ${email}: ${resetUrl}`,
        );
      } else {
        this.logger.log(
          `MAIL_PROVIDER=${provider} - password reset requested (link redacted)`,
        );
      }
      return;
    }

    const host = this.configService.get<string>('SMTP_HOST');
    const port = Number(this.configService.get<string>('SMTP_PORT') ?? 587);
    const user = this.configService.get<string>('SMTP_USER');
    const pass = this.configService.get<string>('SMTP_PASS');
    const from =
      this.configService.get<string>('SMTP_FROM') ??
      'Manga Tracker <no-reply@manga-tracker.local>';

    if (!host || !user || !pass) {
      this.logger.warn(
        'SMTP provider selected but SMTP_HOST/SMTP_USER/SMTP_PASS are missing; using log fallback',
      );
      if (allowSensitiveLogging) {
        this.logger.log(`Password reset link for ${email}: ${resetUrl}`);
      } else {
        this.logger.log('Password reset requested (link redacted)');
      }
      return;
    }

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: {
        user,
        pass,
      },
    });

    await transporter.sendMail({
      from,
      to: email,
      subject: 'Manga Tracker - Password Reset',
      text: `Use this link to reset your password: ${resetUrl}\n\nThis link expires in 15 minutes.`,
      html: `<p>Use this link to reset your password:</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>This link expires in 15 minutes.</p>`,
    });
  }

  async sendIntegrationApprovedEmail(
    email: string,
    payload: {
      partnerName: string;
      partnerSlug: string;
      clientSecret: string;
      docsUrl: string;
    },
  ): Promise<void> {
    const provider =
      this.configService.get<string>('MAIL_PROVIDER')?.toLowerCase() ?? 'log';

    if (provider !== 'smtp') {
      this.logger.log(
        `MAIL_PROVIDER=${provider} - integration approved email queued for ${email} (secret redacted)`,
      );
      return;
    }

    const host = this.configService.get<string>('SMTP_HOST');
    const port = Number(this.configService.get<string>('SMTP_PORT') ?? 587);
    const user = this.configService.get<string>('SMTP_USER');
    const pass = this.configService.get<string>('SMTP_PASS');
    const from =
      this.configService.get<string>('SMTP_FROM') ??
      'Manga Tracker <no-reply@manga-tracker.local>';

    if (!host || !user || !pass) {
      this.logger.warn(
        'SMTP provider selected but SMTP_HOST/SMTP_USER/SMTP_PASS are missing; using log fallback',
      );
      this.logger.log(
        `Integration approved email queued for ${email} (secret redacted)`,
      );
      return;
    }

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: {
        user,
        pass,
      },
    });

    const text = [
      `Your integration request for ${payload.partnerName} was approved.`,
      '',
      'Your partner credentials:',
      `- partnerSlug: ${payload.partnerSlug}`,
      `- clientSecret: ${payload.clientSecret}`,
      '',
      'Next steps:',
      '1) Store clientSecret only on your backend.',
      '2) Let users generate connect code in Manga Tracker.',
      '3) Exchange code on /integrations/connect/exchange.',
      '4) Sync chapters on /integrations/sync with Bearer token.',
      '',
      `Full guide: ${payload.docsUrl}`,
      '',
      'Security note: Rotate clientSecret after initial setup if needed.',
    ].join('\n');

    const html = `
      <p>Your integration request for <strong>${this.escapeHtml(payload.partnerName)}</strong> was approved.</p>
      <p><strong>Your partner credentials:</strong></p>
      <ul>
        <li><code>partnerSlug</code>: <code>${this.escapeHtml(payload.partnerSlug)}</code></li>
        <li><code>clientSecret</code>: <code>${this.escapeHtml(payload.clientSecret)}</code></li>
      </ul>
      <p><strong>Next steps:</strong></p>
      <ol>
        <li>Store <code>clientSecret</code> only on your backend.</li>
        <li>Let users generate connect code in Manga Tracker.</li>
        <li>Exchange code on <code>/integrations/connect/exchange</code>.</li>
        <li>Sync chapters on <code>/integrations/sync</code> using Bearer token.</li>
      </ol>
      <p>Full guide: <a href="${this.escapeHtml(payload.docsUrl)}">${this.escapeHtml(payload.docsUrl)}</a></p>
      <p>Security note: rotate <code>clientSecret</code> after initial setup if needed.</p>
    `;

    await transporter.sendMail({
      from,
      to: email,
      subject: 'Manga Tracker - Integration Approved',
      text,
      html,
    });
  }

  private shouldLogResetLink(): boolean {
    const nodeEnv = this.configService.get<string>('NODE_ENV') ?? 'development';
    const devResponseEnabled =
      this.configService.get<string>('PASSWORD_RESET_DEV_RESPONSE') === 'true';

    return (
      devResponseEnabled && (nodeEnv === 'development' || nodeEnv === 'test')
    );
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}
