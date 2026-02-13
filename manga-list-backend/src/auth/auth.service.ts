import {
  BadRequestException,
  Injectable,
  Inject,
  UnauthorizedException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { Cache } from 'cache-manager';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { MailService } from '../mail/mail.service';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private mailService: MailService,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
  ) {}

  async register(registerDto: RegisterDto) {
    const { username, email, password } = registerDto;

    // Check if user already exists
    const existingUser = await this.prisma.user.findFirst({
      where: {
        OR: [{ email }, { username }],
      },
    });

    if (existingUser) {
      if (existingUser.email === email) {
        throw new ConflictException('Email already in use');
      }
      if (existingUser.username === username) {
        throw new ConflictException('Username already taken');
      }
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const user = await this.prisma.user.create({
      data: {
        username,
        email,
        password: hashedPassword,
      },
      select: {
        id: true,
        username: true,
        email: true,
        tokenVersion: true,
        allowNsfw: true,
        avatarUrl: true,
        bannerUrl: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    // Generate JWT
    const token = this.signToken(user.id, user.tokenVersion);

    return {
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        allowNsfw: user.allowNsfw,
        avatarUrl: user.avatarUrl,
        bannerUrl: user.bannerUrl,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
      token,
    };
  }

  async login(loginDto: LoginDto) {
    const { email, password } = loginDto;

    // Find user
    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user.password) {
      throw new UnauthorizedException(
        'This account uses social login. Please sign in with Google.',
      );
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Generate JWT
    const token = this.signToken(user.id, user.tokenVersion);

    return {
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        allowNsfw: user.allowNsfw,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
      token,
    };
  }

  /**
   * Generate new JWT token for user (used for refresh)
   */
  async generateToken(userId: string): Promise<string> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { tokenVersion: true },
    });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return this.signToken(userId, user.tokenVersion);
  }

  /**
   * Get user by ID (for /auth/me endpoint)
   */
  async getUserById(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        email: true,
        allowNsfw: true,
        avatarUrl: true,
        bannerUrl: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return user;
  }

  async validateUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        email: true,
        tokenVersion: true,
        allowNsfw: true,
        avatarUrl: true,
        bannerUrl: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return user;
  }

  async validateUserTokenVersion(
    userId: string,
    tokenVersion: number,
  ): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { tokenVersion: true },
    });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }
    if (user.tokenVersion !== tokenVersion) {
      throw new UnauthorizedException('Session expired');
    }
  }

  /**
   * Update user profile
   */
  async updateProfile(userId: string, updateData: UpdateProfileDto) {
    const {
      username,
      password,
      currentPassword,
      avatarUrl,
      bannerUrl,
      allowNsfw,
    } = updateData;

    const currentUser = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        password: true,
      },
    });

    if (!currentUser) {
      throw new UnauthorizedException('User not found');
    }

    // Check if username is taken by another user
    if (username) {
      const existingUser = await this.prisma.user.findUnique({
        where: { username },
      });

      if (existingUser && existingUser.id !== userId) {
        throw new ConflictException('Username already taken');
      }
    }

    // Hash password if provided
    let hashedPassword: string | undefined;
    if (password) {
      if (currentUser.password) {
        if (!currentPassword) {
          throw new UnauthorizedException('Current password is required');
        }

        const isCurrentPasswordValid = await bcrypt.compare(
          currentPassword,
          currentUser.password,
        );

        if (!isCurrentPasswordValid) {
          throw new UnauthorizedException('Current password is invalid');
        }
      }

      hashedPassword = await bcrypt.hash(password, 10);
    }

    // Update user
    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(username && { username }),
        ...(hashedPassword && { password: hashedPassword }),
        ...(hashedPassword && { tokenVersion: { increment: 1 } }),
        ...(avatarUrl !== undefined && { avatarUrl }),
        ...(bannerUrl !== undefined && { bannerUrl }),
        ...(allowNsfw !== undefined && { allowNsfw }),
      },
      select: {
        id: true,
        username: true,
        email: true,
        allowNsfw: true,
        avatarUrl: true,
        bannerUrl: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return updatedUser;
  }

  async validateGoogleUser(profile: {
    googleId: string;
    email: string;
    firstName: string;
    lastName: string;
  }) {
    // Check if user exists by googleId
    let user = await this.prisma.user.findUnique({
      where: { googleId: profile.googleId },
    });

    if (user) {
      // User already exists, return with token
      const token = this.signToken(user.id, user.tokenVersion);
      return {
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          allowNsfw: user.allowNsfw,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
        },
        token,
      };
    }

    // Check if user exists by email (might have registered with email/password first)
    user = await this.prisma.user.findUnique({
      where: { email: profile.email },
    });

    if (user) {
      // Link Google account to existing user
      user = await this.prisma.user.update({
        where: { id: user.id },
        data: {
          googleId: profile.googleId,
          provider: 'google',
        },
      });

      const token = this.signToken(user.id, user.tokenVersion);
      return {
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          allowNsfw: user.allowNsfw,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
        },
        token,
      };
    }

    // Generate unique username from Google name + random number
    const baseUsername = profile.firstName
      ? profile.firstName.toLowerCase().replace(/[^a-z0-9]/g, '')
      : 'usuario';
    let username = `${baseUsername}${Math.floor(Math.random() * 101)}`; // 0-100

    // Ensure username is unique
    let attempts = 0;
    while (attempts < 10) {
      const existingUser = await this.prisma.user.findUnique({
        where: { username },
      });

      if (!existingUser) break;

      // Try again with different number
      username = `${baseUsername}${Math.floor(Math.random() * 101)}`;
      attempts++;
    }

    // Fallback if still not unique
    if (attempts === 10) {
      username = `usuario${Math.floor(Math.random() * 10001)}`; // 0-10000
    }

    // Create new user
    user = await this.prisma.user.create({
      data: {
        email: profile.email,
        username,
        googleId: profile.googleId,
        provider: 'google',
        password: null, // No password for OAuth users
      },
    });

    const token = this.signToken(user.id, user.tokenVersion);

    return {
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        allowNsfw: user.allowNsfw,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
      token,
    };
  }

  async createOAuthExchangeCode(userId: string): Promise<string> {
    const code = randomBytes(32).toString('hex');
    await this.cacheManager.set(`oauth:code:${code}`, userId, 5 * 60 * 1000);
    return code;
  }

  async exchangeOAuthCode(code: string) {
    const cacheKey = `oauth:code:${code}`;
    const userId = await this.cacheManager.get<string>(cacheKey);

    if (!userId) {
      throw new UnauthorizedException('Invalid or expired exchange code');
    }

    await this.cacheManager.del(cacheKey);
    const user = await this.getUserById(userId);
    const tokenVersion = await this.getTokenVersion(userId);
    const token = this.signToken(userId, tokenVersion);

    return {
      user,
      token,
    };
  }

  async getOrCreateCsrfToken(userId: string): Promise<string> {
    const cacheKey = `csrf:user:${userId}`;
    const existing = await this.cacheManager.get<string>(cacheKey);

    if (existing) {
      return existing;
    }

    const csrfToken = randomBytes(24).toString('hex');
    await this.cacheManager.set(cacheKey, csrfToken, 24 * 60 * 60 * 1000);
    return csrfToken;
  }

  async validateCsrfToken(userId: string, token: string): Promise<boolean> {
    const cacheKey = `csrf:user:${userId}`;
    const cached = await this.cacheManager.get<string>(cacheKey);
    return !!cached && cached === token;
  }

  async clearCsrfToken(userId: string): Promise<void> {
    await this.cacheManager.del(`csrf:user:${userId}`);
  }

  async getOrCreatePreAuthCsrfToken(sessionId?: string): Promise<{
    sessionId: string;
    csrfToken: string;
  }> {
    const effectiveSessionId = sessionId ?? randomBytes(24).toString('hex');
    const cacheKey = `csrf:preauth:${effectiveSessionId}`;
    const existing = await this.cacheManager.get<string>(cacheKey);

    if (existing) {
      return { sessionId: effectiveSessionId, csrfToken: existing };
    }

    const csrfToken = randomBytes(24).toString('hex');
    await this.cacheManager.set(cacheKey, csrfToken, 24 * 60 * 60 * 1000);
    return { sessionId: effectiveSessionId, csrfToken };
  }

  async validatePreAuthCsrfToken(
    sessionId: string,
    token: string,
  ): Promise<boolean> {
    const cacheKey = `csrf:preauth:${sessionId}`;
    const cached = await this.cacheManager.get<string>(cacheKey);
    return !!cached && cached === token;
  }

  async clearPreAuthCsrfToken(sessionId: string): Promise<void> {
    await this.cacheManager.del(`csrf:preauth:${sessionId}`);
  }

  async requestPasswordReset(email: string) {
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        password: true,
      },
    });

    if (!user || !user.password) {
      return { success: true };
    }

    const token = randomBytes(32).toString('hex');
    await this.cacheManager.set(
      `password-reset:${token}`,
      user.id,
      15 * 60 * 1000,
    );

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const resetUrl = `${frontendUrl.replace(/\/$/, '')}/auth/reset-password?token=${token}`;
    await this.mailService.sendPasswordResetEmail(email, resetUrl);
    this.logger.log(`Password reset requested for user ${user.id}`);

    const includeDevData =
      this.configService.get<string>('PASSWORD_RESET_DEV_RESPONSE') === 'true';
    if (includeDevData) {
      return { success: true, resetToken: token, resetUrl };
    }

    return { success: true };
  }

  async resetPassword(token: string, password: string) {
    const cacheKey = `password-reset:${token}`;
    const userId = await this.cacheManager.get<string>(cacheKey);

    if (!userId) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        password: true,
      },
    });

    if (!user || !user.password) {
      await this.cacheManager.del(cacheKey);
      throw new BadRequestException(
        'Password reset is not available for this account',
      );
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        tokenVersion: { increment: 1 },
      },
    });

    await this.cacheManager.del(cacheKey);
    return { success: true };
  }

  private signToken(userId: string, tokenVersion: number): string {
    return this.jwtService.sign({ sub: userId, tv: tokenVersion });
  }

  private async getTokenVersion(userId: string): Promise<number> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { tokenVersion: true },
    });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }
    return user.tokenVersion;
  }
}
