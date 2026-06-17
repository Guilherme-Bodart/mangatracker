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
  Header,
} from '@nestjs/common';
import { Request as ExpressRequest } from 'express';
import { MangaService } from './manga.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CsrfGuard } from '../auth/guards/csrf.guard';
import { AddMangaToListDto, UpdateMangaListDto } from './dto/manga.dto';
import { SearchMangaQueryDto } from './dto/search-manga-query.dto';
import { TopMangaQueryDto } from './dto/top-manga-query.dto';
import { ProfileRankingQueryDto } from './dto/profile-ranking-query.dto';
import { MergeMangaDuplicatesDto } from './dto/merge-manga-duplicates.dto';
import { MangaAdminGuard } from './guards/manga-admin.guard';

type AuthenticatedRequest = ExpressRequest & {
  user?: {
    id: string;
  };
};

@Controller('manga')
export class MangaController {
  constructor(private readonly mangaService: MangaService) {}

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
  async searchManga(@Query() query: SearchMangaQueryDto) {
    return this.mangaService.searchManga(
      query.q,
      query.page,
      query.genres,
      query.genresMode,
      query.type,
      query.allowNsfw,
      query.provider,
    );
  }

  /**
   * Get top/popular manga (public)
   * GET /manga/top?page=1
   */
  @Header('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400')
  @Get('top')
  async getTopManga(@Query() query: TopMangaQueryDto) {
    return this.mangaService.getTopManga(query.page, query.allowNsfw);
  }

  /**
   * Get profile ranking (public)
   * GET /manga/ranking/profiles?limit=100
   */
  @Get('ranking/profiles')
  async getProfileRanking(@Query() query: ProfileRankingQueryDto) {
    return this.mangaService.getProfileRanking(query.limit);
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
   * List potential duplicate manga groups (admin)
   * GET /manga/admin/duplicates?limit=30
   */
  @UseGuards(JwtAuthGuard, MangaAdminGuard)
  @Get('admin/duplicates')
  async listDuplicateGroups(@Query('limit') limit?: string) {
    const parsed = Number.parseInt(String(limit ?? '30'), 10);
    const safeLimit = Number.isFinite(parsed) ? parsed : 30;
    return this.mangaService.listDuplicateGroups(safeLimit);
  }

  /**
   * Merge duplicate mangas into a canonical manga (admin)
   * POST /manga/admin/duplicates/merge
   */
  @UseGuards(JwtAuthGuard, CsrfGuard, MangaAdminGuard)
  @Post('admin/duplicates/merge')
  async mergeDuplicateGroup(@Body() dto: MergeMangaDuplicatesDto) {
    return this.mangaService.mergeDuplicateGroup(
      dto.canonicalMangaId,
      dto.duplicateMangaIds,
    );
  }

  /**
   * List manga records without covers (admin)
   * GET /manga/admin/covers/missing?limit=50
   */
  @UseGuards(JwtAuthGuard, MangaAdminGuard)
  @Get('admin/covers/missing')
  async listMissingCovers(@Query('limit') limit?: string) {
    const parsed = Number.parseInt(String(limit ?? '50'), 10);
    const safeLimit = Number.isFinite(parsed)
      ? Math.max(1, Math.min(parsed, 200))
      : 50;
    return this.mangaService.listMissingCovers(safeLimit);
  }

  /**
   * Repair missing manga covers in batches (admin)
   * POST /manga/admin/covers/missing/repair?limit=50
   */
  @UseGuards(JwtAuthGuard, CsrfGuard, MangaAdminGuard)
  @Post('admin/covers/missing/repair')
  async repairMissingCovers(@Query('limit') limit?: string) {
    const parsed = Number.parseInt(String(limit ?? '50'), 10);
    const safeLimit = Number.isFinite(parsed)
      ? Math.max(1, Math.min(parsed, 200))
      : 50;
    return this.mangaService.repairMissingCovers(safeLimit, true);
  }

  /**
   * Repair manga cover by forcing provider refresh (admin)
   * POST /manga/admin/:id/repair-cover
   */
  @UseGuards(JwtAuthGuard, CsrfGuard, MangaAdminGuard)
  @Post('admin/:id/repair-cover')
  async repairCoverByMangaId(@Param('id') id: string) {
    return this.mangaService.repairCoverByMangaId(id);
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
