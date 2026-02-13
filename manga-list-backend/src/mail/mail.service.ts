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

    if (provider !== 'smtp') {
      this.logger.log(
        `MAIL_PROVIDER=${provider} - password reset link for ${email}: ${resetUrl}`,
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
      this.logger.log(`Password reset link for ${email}: ${resetUrl}`);
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
}
