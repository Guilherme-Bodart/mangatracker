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
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { Cache } from 'cache-manager';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { MailService } from '../mail/mail.service';
import { CACHE_TTL_MS } from '../cache/cache-ttl.constants';

type ParsedOAuthState = {
  nonce: string;
  issuedAt: number;
};

type OAuthExchangePayload = {
  userId: string;
  contextHash: string | null;
  stateNonce: string;
  userAgentHash: string;
};

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly passwordHashRounds: number;

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private mailService: MailService,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
  ) {
    this.passwordHashRounds = this.resolvePasswordHashRounds();
  }

  async register(registerDto: RegisterDto) {
    const username = this.normalizeUsername(registerDto.username);
    const { email, password } = registerDto;

    // Check if user already exists
    const existingUser = await this.prisma.user.findFirst({
      where: {
        OR: [
          { email },
          {
            username: {
              equals: username,
              mode: 'insensitive',
            },
          },
        ],
      },
    });

    if (existingUser) {
      if (existingUser.email === email) {
        throw new ConflictException('Email already in use');
      }
      if (existingUser.username.toLowerCase() === username.toLowerCase()) {
        throw new ConflictException('Username already taken');
      }
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, this.passwordHashRounds);

    let user: {
      id: string;
      username: string;
      email: string;
      tokenVersion: number;
      allowNsfw: boolean;
      avatarUrl: string | null;
      bannerUrl: string | null;
      createdAt: Date;
      updatedAt: Date;
    };

    try {
      // Create user
      user = await this.prisma.user.create({
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
    } catch (error) {
      if (this.isUniqueConstraintError(error, 'email')) {
        throw new ConflictException('Email already in use');
      }

      if (this.isUniqueConstraintError(error, 'username')) {
        throw new ConflictException('Username already taken');
      }

      throw error;
    }

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
    const normalizedUsername = updateData.username
      ? this.normalizeUsername(updateData.username)
      : undefined;
    const { password, currentPassword, avatarUrl, bannerUrl, allowNsfw } =
      updateData;

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
    if (normalizedUsername) {
      const existingUser = await this.prisma.user.findFirst({
        where: {
          username: {
            equals: normalizedUsername,
            mode: 'insensitive',
          },
        },
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

      hashedPassword = await bcrypt.hash(password, this.passwordHashRounds);
    }

    let updatedUser: {
      id: string;
      username: string;
      email: string;
      allowNsfw: boolean;
      avatarUrl: string | null;
      bannerUrl: string | null;
      createdAt: Date;
      updatedAt: Date;
    };

    try {
      // Update user
      updatedUser = await this.prisma.user.update({
        where: { id: userId },
        data: {
          ...(normalizedUsername && { username: normalizedUsername }),
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
    } catch (error) {
      if (this.isUniqueConstraintError(error, 'username')) {
        throw new ConflictException('Username already taken');
      }

      throw error;
    }

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
      const existingUser = await this.prisma.user.findFirst({
        where: {
          username: {
            equals: username,
            mode: 'insensitive',
          },
        },
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
    try {
      user = await this.prisma.user.create({
        data: {
          email: profile.email,
          username,
          googleId: profile.googleId,
          provider: 'google',
          password: null, // No password for OAuth users
        },
      });
    } catch (error) {
      if (this.isUniqueConstraintError(error, 'username')) {
        throw new ConflictException('Username already taken');
      }

      throw error;
    }

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

  buildOAuthContextHash(sessionId: string, userAgent?: string): string {
    const normalizedAgent = this.normalizeUserAgent(userAgent);
    return createHash('sha256')
      .update(`${sessionId}|${normalizedAgent}`)
      .digest('hex');
  }

  buildUserAgentHash(userAgent?: string): string {
    return createHash('sha256')
      .update(this.normalizeUserAgent(userAgent))
      .digest('hex');
  }

  async createOAuthState(contextHash: string): Promise<string> {
    const nonce = randomBytes(16).toString('hex');
    const issuedAt = Date.now();
    const unsigned = `${nonce}.${issuedAt}`;
    const signature = this.signOAuthState(unsigned);
    const state = `${unsigned}.${signature}`;

    await this.cacheManager.set(
      `oauth:state:${nonce}`,
      contextHash,
      CACHE_TTL_MS.OAUTH_STATE,
    );

    return state;
  }

  async validateAndConsumeOAuthState(
    state: string,
    expectedContextHash: string | null,
  ): Promise<ParsedOAuthState> {
    const parsedState = this.parseAndValidateOAuthState(state);
    const cacheKey = `oauth:state:${parsedState.nonce}`;
    const cachedContextHash = await this.cacheManager.get<string>(cacheKey);

    if (!cachedContextHash) {
      throw new UnauthorizedException('Invalid or expired oauth state');
    }

    await this.cacheManager.del(cacheKey);

    if (expectedContextHash && cachedContextHash !== expectedContextHash) {
      throw new UnauthorizedException('OAuth state context mismatch');
    }

    return parsedState;
  }

  async createOAuthExchangeCode(
    userId: string,
    contextHash: string | null,
    stateNonce: string,
    userAgentHash: string,
  ): Promise<string> {
    const code = randomBytes(32).toString('hex');
    const payload: OAuthExchangePayload = {
      userId,
      contextHash,
      stateNonce,
      userAgentHash,
    };

    await this.cacheManager.set(
      `oauth:code:${code}`,
      payload,
      CACHE_TTL_MS.OAUTH_EXCHANGE_CODE,
    );

    return code;
  }

  async exchangeOAuthCode(
    code: string,
    state: string,
    contextHash: string | null,
    userAgentHash: string,
  ) {
    const parsedState = this.parseAndValidateOAuthState(state);
    const cacheKey = `oauth:code:${code}`;
    const payload = await this.cacheManager.get<OAuthExchangePayload>(cacheKey);

    if (!payload) {
      throw new UnauthorizedException('Invalid or expired exchange code');
    }

    await this.cacheManager.del(cacheKey);

    if (
      contextHash &&
      payload.contextHash &&
      payload.contextHash !== contextHash
    ) {
      throw new UnauthorizedException('OAuth exchange context mismatch');
    }

    if (payload.stateNonce !== parsedState.nonce) {
      throw new UnauthorizedException('OAuth exchange state mismatch');
    }

    if (payload.userAgentHash !== userAgentHash) {
      throw new UnauthorizedException('OAuth exchange user agent mismatch');
    }

    const user = await this.getUserById(payload.userId);
    const tokenVersion = await this.getTokenVersion(payload.userId);
    const token = this.signToken(payload.userId, tokenVersion);

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
    await this.cacheManager.set(cacheKey, csrfToken, CACHE_TTL_MS.CSRF_TOKEN);
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
    await this.cacheManager.set(
      cacheKey,
      csrfToken,
      CACHE_TTL_MS.PRE_AUTH_CSRF_TOKEN,
    );
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
    const cacheKey = this.buildPasswordResetCacheKey(token);
    await this.cacheManager.set(
      cacheKey,
      user.id,
      CACHE_TTL_MS.PASSWORD_RESET_TOKEN,
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
    const cacheKey = this.buildPasswordResetCacheKey(token);
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

    const hashedPassword = await bcrypt.hash(password, this.passwordHashRounds);
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

  private parseAndValidateOAuthState(state: string): ParsedOAuthState {
    const parts = state.split('.');
    if (parts.length !== 3) {
      throw new UnauthorizedException('Invalid oauth state format');
    }

    const [nonce, issuedAtRaw, signature] = parts;
    if (!/^[a-f0-9]{32}$/.test(nonce)) {
      throw new UnauthorizedException('Invalid oauth state nonce');
    }

    if (!/^[a-f0-9]{64}$/.test(signature)) {
      throw new UnauthorizedException('Invalid oauth state signature');
    }

    const issuedAt = Number.parseInt(issuedAtRaw, 10);
    if (!Number.isFinite(issuedAt)) {
      throw new UnauthorizedException('Invalid oauth state timestamp');
    }

    const now = Date.now();
    const ageMs = now - issuedAt;
    if (ageMs < -60_000 || ageMs > CACHE_TTL_MS.OAUTH_STATE) {
      throw new UnauthorizedException('Expired oauth state');
    }

    const unsigned = `${nonce}.${issuedAtRaw}`;
    const expectedSignature = this.signOAuthState(unsigned);

    const receivedBuffer = Buffer.from(signature, 'hex');
    const expectedBuffer = Buffer.from(expectedSignature, 'hex');
    if (
      receivedBuffer.length !== expectedBuffer.length ||
      !timingSafeEqual(receivedBuffer, expectedBuffer)
    ) {
      throw new UnauthorizedException('Invalid oauth state signature');
    }

    return { nonce, issuedAt };
  }

  private signOAuthState(value: string): string {
    return createHmac('sha256', this.getOAuthStateSecret())
      .update(value)
      .digest('hex');
  }

  private getOAuthStateSecret(): string {
    const secret =
      this.configService.get<string>('OAUTH_STATE_SECRET') ??
      this.configService.get<string>('JWT_SECRET');

    if (!secret) {
      throw new UnauthorizedException('OAuth state secret is not configured');
    }

    return secret;
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

  private resolvePasswordHashRounds(): number {
    const raw = this.configService.get<string>('PASSWORD_HASH_ROUNDS');
    const fallback = 12;

    if (!raw?.trim()) {
      return fallback;
    }

    const parsed = Number.parseInt(raw, 10);
    if (!Number.isInteger(parsed) || parsed < 4) {
      return fallback;
    }

    return parsed;
  }

  private buildPasswordResetCacheKey(token: string): string {
    const secret =
      this.configService.get<string>('PASSWORD_RESET_TOKEN_SECRET') ??
      this.configService.get<string>('JWT_SECRET');
    if (!secret) {
      throw new BadRequestException('Password reset secret is not configured');
    }

    const digest = createHmac('sha256', secret)
      .update(token.trim())
      .digest('hex');

    return `password-reset:${digest}`;
  }

  private normalizeUserAgent(userAgent?: string): string {
    return (userAgent ?? 'unknown').trim().toLowerCase();
  }

  private normalizeUsername(username: string): string {
    return username.trim();
  }

  private isUniqueConstraintError(error: unknown, field?: string): boolean {
    if (
      !(error instanceof Prisma.PrismaClientKnownRequestError) ||
      error.code !== 'P2002'
    ) {
      return false;
    }

    if (!field) {
      return true;
    }

    const rawTargets = error.meta?.target;
    const targets = Array.isArray(rawTargets)
      ? rawTargets.map((item) => String(item).toLowerCase())
      : [String(rawTargets ?? '').toLowerCase()];

    return targets.some((target) => target.includes(field.toLowerCase()));
  }
}
