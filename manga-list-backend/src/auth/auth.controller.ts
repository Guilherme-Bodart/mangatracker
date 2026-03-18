import {
  BadRequestException,
  Controller,
  Post,
  Get,
  Patch,
  Body,
  UseGuards,
  Request,
  Res,
  HttpCode,
  HttpStatus,
  Req,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Request as ExpressRequest, Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { OAuthExchangeDto } from './dto/oauth-exchange.dto';
import { AuthRateLimitGuard } from './guards/auth-rate-limit.guard';
import { CsrfGuard } from './guards/csrf.guard';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { GoogleAuthGuard } from './guards/google-auth.guard';
import { CACHE_TTL_MS } from '../cache/cache-ttl.constants';
import { randomBytes } from 'crypto';

type AuthenticatedUser = {
  id: string;
  username: string;
  email: string;
  allowNsfw: boolean;
  avatarUrl: string | null;
  bannerUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type RequestWithUser = ExpressRequest & {
  user?: AuthenticatedUser;
};

@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private configService: ConfigService,
  ) {}

  private setAuthCookie(res: Response, token: string) {
    const { secure, sameSite, domain, partitioned } = this.getCookieOptions();
    res.cookie('auth_token', token, {
      httpOnly: true,
      secure,
      sameSite,
      path: '/',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      ...(domain ? { domain } : {}),
      ...(partitioned ? { partitioned: true } : {}),
    });
  }

  private setCsrfCookie(res: Response, csrfToken: string) {
    const { secure, sameSite, domain, partitioned } = this.getCookieOptions();
    res.cookie('csrf_token', csrfToken, {
      httpOnly: false,
      secure,
      sameSite,
      path: '/',
      maxAge: 24 * 60 * 60 * 1000,
      ...(domain ? { domain } : {}),
      ...(partitioned ? { partitioned: true } : {}),
    });
  }

  private setCsrfSessionCookie(res: Response, sessionId: string) {
    const { secure, sameSite, domain, partitioned } = this.getCookieOptions();
    res.cookie('csrf_session', sessionId, {
      httpOnly: true,
      secure,
      sameSite,
      path: '/',
      maxAge: 24 * 60 * 60 * 1000,
      ...(domain ? { domain } : {}),
      ...(partitioned ? { partitioned: true } : {}),
    });
  }

  private setOAuthSessionCookie(res: Response, sessionId: string) {
    const { secure, sameSite, domain, partitioned } = this.getCookieOptions();
    res.cookie('oauth_session', sessionId, {
      httpOnly: true,
      secure,
      sameSite,
      path: '/',
      maxAge: CACHE_TTL_MS.OAUTH_STATE,
      ...(domain ? { domain } : {}),
      ...(partitioned ? { partitioned: true } : {}),
    });
  }

  private getCookieOptions() {
    const secure =
      this.configService.get<string>('COOKIE_SECURE') === 'true' ||
      this.configService.get<string>('NODE_ENV') === 'production';

    const domain = this.configService.get<string>('COOKIE_DOMAIN');
    const sameSite = (this.configService.get<'lax' | 'strict' | 'none'>(
      'COOKIE_SAMESITE',
    ) ?? 'lax') as 'lax' | 'strict' | 'none';
    const partitionedSetting = this.configService.get<string>('COOKIE_PARTITIONED');
    const partitioned =
      partitionedSetting === 'true' ||
      (!partitionedSetting && secure && sameSite === 'none');

    return { secure, sameSite, domain, partitioned };
  }

  private clearAuthCookie(res: Response) {
    const { secure, sameSite, domain, partitioned } = this.getCookieOptions();
    res.clearCookie('auth_token', {
      httpOnly: true,
      secure,
      sameSite,
      path: '/',
      ...(domain ? { domain } : {}),
      ...(partitioned ? { partitioned: true } : {}),
    });
  }

  private clearCsrfCookie(res: Response) {
    const { secure, sameSite, domain, partitioned } = this.getCookieOptions();
    res.clearCookie('csrf_token', {
      httpOnly: false,
      secure,
      sameSite,
      path: '/',
      ...(domain ? { domain } : {}),
      ...(partitioned ? { partitioned: true } : {}),
    });
  }

  private clearCsrfSessionCookie(res: Response) {
    const { secure, sameSite, domain, partitioned } = this.getCookieOptions();
    res.clearCookie('csrf_session', {
      httpOnly: true,
      secure,
      sameSite,
      path: '/',
      ...(domain ? { domain } : {}),
      ...(partitioned ? { partitioned: true } : {}),
    });
  }

  private clearOAuthSessionCookie(res: Response) {
    const { secure, sameSite, domain, partitioned } = this.getCookieOptions();
    res.clearCookie('oauth_session', {
      httpOnly: true,
      secure,
      sameSite,
      path: '/',
      ...(domain ? { domain } : {}),
      ...(partitioned ? { partitioned: true } : {}),
    });
  }

  private readCookie(cookieHeader: string | undefined, name: string) {
    if (!cookieHeader) return null;
    const cookies = cookieHeader.split(';');
    for (const cookie of cookies) {
      const [rawName, ...rawValue] = cookie.trim().split('=');
      if (rawName === name) {
        const value = rawValue.join('=');
        return value ? decodeURIComponent(value) : null;
      }
    }
    return null;
  }

  private getOAuthContextHash(req: ExpressRequest): string {
    const sessionId = this.readCookie(req.headers?.cookie, 'oauth_session');
    if (!sessionId) {
      throw new BadRequestException('Missing oauth session cookie');
    }

    const userAgent = req.headers['user-agent'];
    return this.authService.buildOAuthContextHash(
      sessionId,
      typeof userAgent === 'string' ? userAgent : undefined,
    );
  }

  private requireUser(req: RequestWithUser): AuthenticatedUser {
    if (!req.user) {
      throw new BadRequestException('Authenticated user not found');
    }
    return req.user;
  }

  @Get('csrf')
  @UseGuards(AuthRateLimitGuard)
  async getCsrfToken(
    @Req() req: ExpressRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const sessionId = this.readCookie(req.headers?.cookie, 'csrf_session');
    const result = await this.authService.getOrCreatePreAuthCsrfToken(
      sessionId ?? undefined,
    );
    this.setCsrfSessionCookie(res, result.sessionId);
    this.setCsrfCookie(res, result.csrfToken);
    return { success: true, csrfToken: result.csrfToken };
  }

  @Post('register')
  @UseGuards(AuthRateLimitGuard, CsrfGuard)
  async register(
    @Req() req: ExpressRequest,
    @Body() registerDto: RegisterDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.register(registerDto);
    const sessionId = this.readCookie(req.headers?.cookie, 'csrf_session');
    if (sessionId) {
      await this.authService.clearPreAuthCsrfToken(sessionId);
      this.clearCsrfSessionCookie(res);
    }
    this.setAuthCookie(res, result.token);
    const csrfToken = await this.authService.getOrCreateCsrfToken(
      result.user.id,
    );
    this.setCsrfCookie(res, csrfToken);
    return { user: result.user, csrfToken };
  }

  @Post('login')
  @UseGuards(AuthRateLimitGuard, CsrfGuard)
  async login(
    @Req() req: ExpressRequest,
    @Body() loginDto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.login(loginDto);
    const sessionId = this.readCookie(req.headers?.cookie, 'csrf_session');
    if (sessionId) {
      await this.authService.clearPreAuthCsrfToken(sessionId);
      this.clearCsrfSessionCookie(res);
    }
    this.setAuthCookie(res, result.token);
    const csrfToken = await this.authService.getOrCreateCsrfToken(
      result.user.id,
    );
    this.setCsrfCookie(res, csrfToken);
    return { user: result.user, csrfToken };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async getProfile(
    @Request() req: RequestWithUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    const user = this.requireUser(req);
    const csrfToken = await this.authService.getOrCreateCsrfToken(user.id);
    this.setCsrfCookie(res, csrfToken);
    return {
      csrfToken,
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
    };
  }

  @Get('refresh')
  @UseGuards(JwtAuthGuard, AuthRateLimitGuard)
  async refreshToken(
    @Request() req: RequestWithUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    const user = this.requireUser(req);
    const token = await this.authService.generateToken(user.id);
    this.setAuthCookie(res, token);
    const csrfToken = await this.authService.getOrCreateCsrfToken(user.id);
    this.setCsrfCookie(res, csrfToken);
    return { success: true, csrfToken };
  }

  @Post('exchange')
  async exchangeOAuthCode(
    @Req() req: ExpressRequest,
    @Body() dto: OAuthExchangeDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const contextHash = this.getOAuthContextHash(req);
    const result = await this.authService.exchangeOAuthCode(
      dto.code,
      dto.state,
      contextHash,
    );
    this.clearOAuthSessionCookie(res);
    this.setAuthCookie(res, result.token);
    const csrfToken = await this.authService.getOrCreateCsrfToken(
      result.user.id,
    );
    this.setCsrfCookie(res, csrfToken);
    return { user: result.user, csrfToken };
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, CsrfGuard)
  async logout(
    @Request() req: RequestWithUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    const user = this.requireUser(req);
    await this.authService.clearCsrfToken(user.id);
    const sessionId = this.readCookie(req.headers?.cookie, 'csrf_session');
    if (sessionId) {
      await this.authService.clearPreAuthCsrfToken(sessionId);
      this.clearCsrfSessionCookie(res);
    }
    this.clearAuthCookie(res);
    this.clearCsrfCookie(res);
    return { success: true };
  }

  @Patch('profile')
  @UseGuards(JwtAuthGuard, CsrfGuard)
  async updateProfile(
    @Request() req: RequestWithUser,
    @Body() updateProfileDto: UpdateProfileDto,
  ) {
    const user = this.requireUser(req);
    const updatedUser = await this.authService.updateProfile(
      user.id,
      updateProfileDto,
    );
    return { user: updatedUser };
  }

  @Post('forgot-password')
  @UseGuards(AuthRateLimitGuard)
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.requestPasswordReset(dto.email);
  }

  @Post('reset-password')
  @UseGuards(AuthRateLimitGuard)
  async resetPassword(@Body() dto: ResetPasswordDto) {
    if (dto.password !== dto.confirmPassword) {
      throw new BadRequestException('Passwords do not match');
    }
    return this.authService.resetPassword(dto.token, dto.password);
  }

  @Get('google')
  @UseGuards(GoogleAuthGuard)
  async googleAuth() {
    // Initiates Google OAuth flow
  }

  @Get('google/start')
  @UseGuards(AuthRateLimitGuard)
  async googleAuthStart(@Req() req: ExpressRequest, @Res() res: Response) {
    const existingSessionId = this.readCookie(req.headers?.cookie, 'oauth_session');
    const sessionId = existingSessionId || randomBytes(24).toString('hex');
    const userAgent = req.headers['user-agent'];
    const contextHash = this.authService.buildOAuthContextHash(
      sessionId,
      typeof userAgent === 'string' ? userAgent : undefined,
    );
    const state = await this.authService.createOAuthState(contextHash);

    // Reuse current oauth_session when available so repeated clicks/tabs
    // do not invalidate previous state context for the same browser.
    this.setOAuthSessionCookie(res, sessionId);
    res.redirect(`/auth/google?state=${encodeURIComponent(state)}`);
  }

  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  async googleAuthRedirect(
    @Request()
    req: ExpressRequest & {
      user?: {
        googleId: string;
        email: string;
        firstName: string;
        lastName: string;
      };
    },
    @Res() res: Response,
  ) {
    if (!req.user) {
      throw new BadRequestException('Google profile not found');
    }

    const state =
      typeof req.query.state === 'string' ? req.query.state : undefined;
    if (!state) {
      throw new BadRequestException('OAuth state not found');
    }

    const contextHash = this.getOAuthContextHash(req);
    const parsedState = await this.authService.validateAndConsumeOAuthState(
      state,
      contextHash,
    );

    // Validate Google user and mint a short-lived one-time exchange code
    const result = await this.authService.validateGoogleUser(req.user);
    const code = await this.authService.createOAuthExchangeCode(
      result.user.id,
      contextHash,
      parsedState.nonce,
    );

    // Redirect to frontend with temporary code (never with JWT)
    const frontendUrl = this.configService.get<string>('FRONTEND_URL');
    res.redirect(
      `${frontendUrl}/auth/callback?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`,
    );
  }
}
