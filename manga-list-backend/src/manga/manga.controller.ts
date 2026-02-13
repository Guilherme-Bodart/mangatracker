import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  UnauthorizedException,
} from '@nestjs/common';
import { Request as ExpressRequest } from 'express';
import { MangaService } from './manga.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CsrfGuard } from '../auth/guards/csrf.guard';
import { AddMangaToListDto, UpdateMangaListDto } from './dto/manga.dto';

type AuthenticatedRequest = ExpressRequest & {
  user?: {
    id: string;
  };
};

@Controller('manga')
export class MangaController {
  constructor(private readonly mangaService: MangaService) {}

  private parsePage(page?: string): number {
    if (!page) return 1;
    const parsed = Number(page);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
  }

  private parseBoolean(value?: string): boolean {
    if (!value) return false;
    return value === 'true' || value === '1';
  }

  private parseLimit(limit?: string): number {
    if (!limit) return 100;
    const parsed = Number(limit);
    if (!Number.isInteger(parsed) || parsed <= 0) return 100;
    return Math.min(parsed, 100);
  }

  private requireUserId(req: AuthenticatedRequest): string {
    if (!req.user?.id) {
      throw new UnauthorizedException('Authenticated user not found');
    }
    return req.user.id;
  }

  /**
   * Search manga (public)
   * GET /manga/search?q=naruto&page=1&genres=1,2&genresMode=AND
   */
  @Get('search')
  async searchManga(
    @Query('q') query: string,
    @Query('page') page?: string,
    @Query('genres') genres?: string, // comma-separated genre IDs: "1,2,3"
    @Query('genresMode') genresMode?: 'AND' | 'OR', // default: 'OR'
    @Query('type') type?: string,
    @Query('allowNsfw') allowNsfw?: string,
  ) {
    return this.mangaService.searchManga(
      query,
      this.parsePage(page),
      genres,
      genresMode || 'OR',
      type,
      this.parseBoolean(allowNsfw),
    );
  }

  /**
   * Get top/popular manga (public)
   * GET /manga/top?page=1
   */
  @Get('top')
  async getTopManga(
    @Query('page') page?: string,
    @Query('allowNsfw') allowNsfw?: string,
  ) {
    return this.mangaService.getTopManga(
      this.parsePage(page),
      this.parseBoolean(allowNsfw),
    );
  }

  /**
   * Get profile ranking (public)
   * GET /manga/ranking/profiles?limit=100
   */
  @Get('ranking/profiles')
  async getProfileRanking(@Query('limit') limit?: string) {
    return this.mangaService.getProfileRanking(this.parseLimit(limit));
  }

  /**
   * Get user's manga list by username (public)
   * GET /manga/user/:username
   */
  @Get('user/:username')
  async getUserListByUsername(@Param('username') username: string) {
    return this.mangaService.getUserListByUsername(username);
  }

  /**
   * Get like state for a profile (protected)
   * GET /manga/user/:username/like-state
   */
  @UseGuards(JwtAuthGuard)
  @Get('user/:username/like-state')
  async getProfileLikeState(
    @Param('username') username: string,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.mangaService.getProfileLikeState(
      username,
      this.requireUserId(req),
    );
  }

  /**
   * Toggle like for a profile (protected)
   * POST /manga/user/:username/like
   */
  @UseGuards(JwtAuthGuard, CsrfGuard)
  @Post('user/:username/like')
  async toggleProfileLike(
    @Param('username') username: string,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.mangaService.toggleProfileLike(
      username,
      this.requireUserId(req),
    );
  }

  /**
   * Add manga to user's list (protected)
   * POST /manga/list
   */
  @UseGuards(JwtAuthGuard, CsrfGuard)
  @Post('list')
  async addToList(
    @Request() req: AuthenticatedRequest,
    @Body() dto: AddMangaToListDto,
  ) {
    return this.mangaService.addMangaToList(this.requireUserId(req), dto);
  }

  /**
   * Get user's manga list (protected)
   * GET /manga/list
   */
  @UseGuards(JwtAuthGuard)
  @Get('list')
  async getUserList(@Request() req: AuthenticatedRequest) {
    return this.mangaService.getUserList(this.requireUserId(req));
  }

  /**
   * Get latest 2 chapters for each manga in user's list (protected)
   * GET /manga/list/latest-chapters
   */
  @UseGuards(JwtAuthGuard)
  @Get('list/latest-chapters')
  async getLatestChaptersForUserList(@Request() req: AuthenticatedRequest) {
    return this.mangaService.getLatestChaptersForUserList(
      this.requireUserId(req),
    );
  }

  /**
   * Update manga in user's list (protected)
   * PATCH /manga/list/:id
   */
  @UseGuards(JwtAuthGuard, CsrfGuard)
  @Patch('list/:id')
  async updateUserManga(
    @Param('id') id: string,
    @Request() req: AuthenticatedRequest,
    @Body() dto: UpdateMangaListDto,
  ) {
    return this.mangaService.updateUserManga(id, this.requireUserId(req), dto);
  }

  /**
   * Remove manga from user's list (protected)
   * DELETE /manga/list/:id
   */
  @UseGuards(JwtAuthGuard, CsrfGuard)
  @Delete('list/:id')
  async removeFromList(
    @Param('id') id: string,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.mangaService.removeFromUserList(id, this.requireUserId(req));
  }

  /**
   * Toggle favorite status for manga in user's list (protected)
   * PATCH /manga/list/:id/favorite
   */
  @UseGuards(JwtAuthGuard, CsrfGuard)
  @Patch('list/:id/favorite')
  async toggleFavorite(
    @Param('id') id: string,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.mangaService.toggleFavorite(id, this.requireUserId(req));
  }
}
