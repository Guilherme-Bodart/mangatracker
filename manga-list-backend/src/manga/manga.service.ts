import {
  Injectable,
  HttpException,
  HttpStatus,
  Inject,
  Logger,
} from '@nestjs/common';
import { MangaStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { MangaDexService } from '../mangadex/mangadex.service';
import {
  JikanSearchResponse,
  JikanMangaSearchResult,
  AddMangaToListDto,
  UpdateMangaListDto,
} from './dto/manga.dto';

type JikanMangaDetails = {
  mal_id: number;
  title: string;
  status?: string | null;
  chapters?: number | null;
  images?: {
    jpg?: {
      large_image_url?: string | null;
    };
  };
  synopsis?: string | null;
  authors?: Array<{ name: string }>;
  genres?: Array<{ name: string }>;
};

type LatestChapterDto = {
  chapter: string;
  title: string | null;
  publishedAt: string | null;
};

@Injectable()
export class MangaService {
  private readonly logger = new Logger(MangaService.name);
  private readonly JIKAN_BASE_URL = 'https://api.jikan.moe/v4';
  private readonly externalApiTimeoutMs = this.parseEnvInt(
    process.env.EXTERNAL_API_TIMEOUT_MS,
    10000,
  );
  private readonly externalApiRetries = this.parseEnvInt(
    process.env.EXTERNAL_API_RETRIES,
    2,
  );

  private buildFallbackMangaDataFromDb(manga: {
    malId: number;
    title: string;
    publicationStatus: string | null;
    totalChapters: number | null;
    coverImage: string | null;
    description: string | null;
  }): JikanMangaDetails {
    return {
      mal_id: manga.malId,
      title: manga.title,
      status: manga.publicationStatus,
      chapters: manga.totalChapters,
      images: { jpg: { large_image_url: manga.coverImage } },
      synopsis: manga.description,
    };
  }

  constructor(
    private prisma: PrismaService,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
    private mangaDexService: MangaDexService,
  ) {}

  /**
   * Search manga using Jikan API (MyAnimeList) with Caching
   * Supports genre filtering with AND/OR logic
   */
  async searchManga(
    query: string,
    page: number = 1,
    genres?: string,
    genresMode: 'AND' | 'OR' = 'OR',
    type?: string,
    allowNsfw: boolean = false,
  ): Promise<JikanSearchResponse> {
    const cacheKey = `search:${query}:${page}:${genres}:${genresMode}:${type}:${allowNsfw}`;
    const cachedResult =
      await this.cacheManager.get<JikanSearchResponse>(cacheKey);

    if (cachedResult) {
      return cachedResult;
    }

    try {
      // Default to sorting by members (most read) if not specified
      // "Trending" usually means most people reading it.
      let url = `${this.JIKAN_BASE_URL}/manga?page=${page}&limit=20&order_by=members&sort=desc`;

      if (query) {
        // If there's a search query, Jikan might prioritize relevance,
        // but we can still request sorting if desired.
        // For now, let's keep popularity as default even with query unless explicit sort is added later.
        url += `&q=${encodeURIComponent(query)}`;
      }

      if (type) {
        url += `&type=${type}`;
      }

      if (genres) {
        const genreIds = genres
          .split(',')
          .map((id) => id.trim())
          .filter((id) => id);

        if (genreIds.length > 0) {
          url += `&genres=${genreIds.join(',')}`;
        }
      }

      const response = await this.fetchWithRetry(url);

      if (!response.ok) {
        if (response.status === 429) {
          throw new HttpException(
            'Too many requests, please try again later',
            HttpStatus.TOO_MANY_REQUESTS,
          );
        }
        throw new HttpException(
          'Failed to search manga',
          HttpStatus.BAD_GATEWAY,
        );
      }

      const data = (await response.json()) as JikanSearchResponse;
      if (!allowNsfw) {
        data.data = this.filterNsfwResults(data.data);
      }

      // Cache the result for 24 hours
      await this.cacheManager.set(cacheKey, data, 60 * 60 * 24 * 1000);

      return data;
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        'Internal server error during search',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Get Manga details from DB or fetch from Jikan + MangaDex
   * Implements the "Hybrid Description" strategy
   */
  async getMangaDetails(
    malId: number,
    title?: string,
    jikanManga?: JikanMangaDetails | null,
  ) {
    // 1. Check if manga exists in our DB
    let manga = await this.prisma.manga.findUnique({
      where: { malId },
    });

    // 2. If it exists, has descriptions, AND has lastChapter, return it
    if (
      manga &&
      (manga.descriptionPt || manga.description) &&
      manga.lastChapter
    ) {
      return manga;
    }

    // 3. If new or missing info, we need to fetch/update
    // Use provided Jikan data or fetch it if missing
    let mangaData: JikanMangaDetails | null | undefined = jikanManga;
    if (!mangaData) {
      // If we already have the manga in DB, we might want to avoid re-fetching Jikan if possible,
      // but for simplicity and freshness, let's fetch if we are doing an update flow.
      const response = await this.fetchWithRetry(
        `${this.JIKAN_BASE_URL}/manga/${malId}`,
      );
      if (response.ok) {
        const data = (await response.json()) as { data: JikanMangaDetails };
        mangaData = data.data;
      }
    }

    if (!mangaData && manga) {
      // Fallback: use existing DB data as "mangaData" if Jikan failed but we have DB record
      // This prevents failure if Jikan is down but we just wanted to check MangaDex
      mangaData = this.buildFallbackMangaDataFromDb(manga);
    }

    if (!mangaData) return null; // Can't do anything without data

    // 4. Fetch descriptions and status from MangaDex
    let descriptions: { en: string | null; pt: string | null } = {
      en: null,
      pt: null,
    };
    let dexStatus: string | null = null;
    let dexLastChapter: string | null = null;

    // Search MangaDex if likely needed (always search if we are here for an update/create)
    if (title || mangaData.title) {
      try {
        const dexManga = await this.mangaDexService.searchMangaByTitle(
          title || mangaData.title,
        );

        if (dexManga) {
          descriptions = await this.mangaDexService.getDescriptions(
            dexManga.id,
          );
          dexStatus = dexManga.attributes.status ?? null;
          dexLastChapter = dexManga.attributes.lastChapter ?? null;
        }
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : 'Unknown error';
        this.logger.warn(
          `Failed to fetch from MangaDex, continuing with Jikan only: ${message}`,
        );
      }
    }

    // 5. Save/Update in DB
    const descriptionEn =
      descriptions.en || mangaData.synopsis || manga?.description || null;
    const descriptionPt = descriptions.pt || manga?.descriptionPt || null;

    // Map status: MangaDex (ongoing, completed, hiatus, cancelled) -> Jikan style or custom
    let status = mangaData.status; // Default to Jikan
    if (dexStatus) {
      if (dexStatus === 'ongoing') status = 'Publishing';
      else if (dexStatus === 'completed') status = 'Finished';
      else if (dexStatus === 'hiatus') status = 'On Hiatus';
      else if (dexStatus === 'cancelled') status = 'Discontinued';
    }

    const lastChapter =
      dexLastChapter ||
      (status === 'Finished' ? mangaData.chapters?.toString() : null) ||
      manga?.lastChapter;

    if (manga) {
      // Update existing
      manga = await this.prisma.manga.update({
        where: { id: manga.id },
        data: {
          description: descriptionEn,
          descriptionPt: descriptionPt,
          publicationStatus: status,
          lastChapter: lastChapter,
          lastCheckedAt: new Date(), // Update checked time
        },
      });
    } else {
      // Create new
      manga = await this.prisma.manga.create({
        data: {
          malId: mangaData.mal_id,
          title: mangaData.title,
          coverImage: mangaData.images?.jpg?.large_image_url,
          author: mangaData.authors?.[0]?.name,
          genres: mangaData.genres?.map((g) => g.name) || [],
          totalChapters: mangaData.chapters,
          description: descriptionEn,
          descriptionPt: descriptionPt,
          publicationStatus: status,
          lastChapter: lastChapter,
        },
      });
    }

    return manga;
  }

  /**
   * Get top/popular manga from Jikan
   */
  async getTopManga(
    page: number = 1,
    allowNsfw: boolean = false,
  ): Promise<JikanSearchResponse> {
    const cacheKey = `top-manga:${page}:${allowNsfw}`;
    const cachedResult =
      await this.cacheManager.get<JikanSearchResponse>(cacheKey);

    if (cachedResult) {
      return cachedResult;
    }

    try {
      const response = await this.fetchWithRetry(
        `${this.JIKAN_BASE_URL}/top/manga?page=${page}&limit=20`,
      );

      if (!response.ok) {
        throw new HttpException(
          'Failed to fetch top manga',
          HttpStatus.BAD_GATEWAY,
        );
      }

      const data = (await response.json()) as JikanSearchResponse;
      if (!allowNsfw) {
        data.data = this.filterNsfwResults(data.data);
      }

      // Cache for 24 hours
      await this.cacheManager.set(cacheKey, data, 60 * 60 * 24 * 1000);

      return data;
    } catch {
      throw new HttpException(
        'Could not connect to MyAnimeList API',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  /**
   * Add manga to user's list
   */
  async addMangaToList(userId: string, addMangaDto: AddMangaToListDto) {
    const { malId, status, rating, currentChapter, notes, isFavorite } =
      addMangaDto;

    // Use our new method to get/create manga with proper descriptions
    // We pass title as undefined first, getMangaDetails will fetch from Jikan if needed
    const manga = await this.getMangaDetails(malId);

    if (!manga) {
      throw new HttpException(
        'Failed to fetch manga details',
        HttpStatus.BAD_GATEWAY,
      );
    }

    // 3. Check if user already has this manga in their list
    const existing = await this.prisma.userManga.findFirst({
      where: {
        userId,
        mangaId: manga.id,
      },
    });

    if (existing) {
      throw new HttpException(
        'This manga is already in your list',
        HttpStatus.CONFLICT,
      );
    }

    // 4. Create UserManga entry
    const userManga = await this.prisma.userManga.create({
      data: {
        userId,
        mangaId: manga.id,
        status: status,
        rating: rating,
        currentChapter: currentChapter,
        notes: notes,
        isFavorite: isFavorite || false,
      },
      include: {
        manga: true,
      },
    });

    return userManga;
  }

  /**
   * Get user's manga list
   */
  async getUserList(userId: string) {
    return this.prisma.userManga.findMany({
      where: { userId },
      include: {
        manga: true,
      },
      orderBy: [
        { isFavorite: 'desc' },
        { rating: 'desc' },
        { manga: { title: 'asc' } },
      ],
    });
  }

  /**
   * Get user's manga list by username (public)
   */
  async getUserListByUsername(username: string) {
    // Find user by username
    const user = await this.prisma.user.findUnique({
      where: { username },
      select: {
        id: true,
        username: true,
        avatarUrl: true,
        bannerUrl: true,
        _count: {
          select: {
            likesReceived: true,
          },
        },
      },
    });

    if (!user) {
      throw new HttpException('User not found', HttpStatus.NOT_FOUND);
    }

    // Get their manga list
    const mangaList = await this.prisma.userManga.findMany({
      where: { userId: user.id },
      include: {
        manga: true,
      },
      orderBy: [
        { isFavorite: 'desc' },
        { rating: 'desc' },
        { manga: { title: 'asc' } },
      ],
    });

    // Calculate stats
    const stats = {
      total: mangaList.length,
      reading: mangaList.filter((m) => m.status === 'READING').length,
      completed: mangaList.filter((m) => m.status === 'COMPLETED').length,
      planToRead: mangaList.filter((m) => m.status === 'PLAN_TO_READ').length,
      dropped: mangaList.filter((m) => m.status === 'DROPPED').length,
      favorites: mangaList.filter((m) => m.isFavorite).length,
    };

    return {
      user: {
        id: user.id,
        username: user.username,
        avatarUrl: user.avatarUrl,
        bannerUrl: user.bannerUrl,
        totalLikes: user._count.likesReceived,
      },
      mangaList,
      stats,
    };
  }

  async getProfileLikeState(username: string, currentUserId: string) {
    const targetUser = await this.prisma.user.findUnique({
      where: { username },
      select: {
        id: true,
        _count: {
          select: {
            likesReceived: true,
          },
        },
      },
    });

    if (!targetUser) {
      throw new HttpException('User not found', HttpStatus.NOT_FOUND);
    }

    if (targetUser.id === currentUserId) {
      return {
        liked: false,
        isOwnProfile: true,
        totalLikes: targetUser._count.likesReceived,
      };
    }

    const existingLike = await this.prisma.profileLike.findUnique({
      where: {
        likerId_likedUserId: {
          likerId: currentUserId,
          likedUserId: targetUser.id,
        },
      },
      select: { id: true },
    });

    return {
      liked: !!existingLike,
      isOwnProfile: false,
      totalLikes: targetUser._count.likesReceived,
    };
  }

  async toggleProfileLike(username: string, currentUserId: string) {
    const targetUser = await this.prisma.user.findUnique({
      where: { username },
      select: { id: true },
    });

    if (!targetUser) {
      throw new HttpException('User not found', HttpStatus.NOT_FOUND);
    }

    if (targetUser.id === currentUserId) {
      throw new HttpException(
        'You cannot like your own profile',
        HttpStatus.BAD_REQUEST,
      );
    }

    const existingLike = await this.prisma.profileLike.findUnique({
      where: {
        likerId_likedUserId: {
          likerId: currentUserId,
          likedUserId: targetUser.id,
        },
      },
      select: { id: true },
    });

    if (existingLike) {
      await this.prisma.profileLike.delete({
        where: { id: existingLike.id },
      });
    } else {
      await this.prisma.profileLike.create({
        data: {
          likerId: currentUserId,
          likedUserId: targetUser.id,
        },
      });
    }

    const totalLikes = await this.prisma.profileLike.count({
      where: { likedUserId: targetUser.id },
    });

    return {
      liked: !existingLike,
      totalLikes,
    };
  }

  async getProfileRanking(limit: number = 100) {
    const safeLimit = Math.max(1, Math.min(limit, 100));

    const users = await this.prisma.user.findMany({
      take: safeLimit,
      orderBy: [{ likesReceived: { _count: 'desc' } }, { createdAt: 'asc' }],
      select: {
        id: true,
        username: true,
        avatarUrl: true,
        bannerUrl: true,
        _count: {
          select: {
            likesReceived: true,
          },
        },
      },
    });

    if (users.length === 0) {
      return { ranking: [] };
    }

    const userIds = users.map((user) => user.id);
    const groupedStatuses = await this.prisma.userManga.groupBy({
      by: ['userId', 'status'],
      where: {
        userId: { in: userIds },
        status: { in: [MangaStatus.COMPLETED, MangaStatus.READING] },
      },
      _count: {
        _all: true,
      },
    });

    const statusMap = new Map<string, { completed: number; reading: number }>();

    for (const entry of groupedStatuses) {
      const current = statusMap.get(entry.userId) ?? {
        completed: 0,
        reading: 0,
      };

      if (entry.status === MangaStatus.COMPLETED) {
        current.completed = entry._count._all;
      }

      if (entry.status === MangaStatus.READING) {
        current.reading = entry._count._all;
      }

      statusMap.set(entry.userId, current);
    }

    const ranking = users.map((user, index) => {
      const stats = statusMap.get(user.id) ?? { completed: 0, reading: 0 };

      return {
        rank: index + 1,
        username: user.username,
        avatarUrl: user.avatarUrl,
        bannerUrl: user.bannerUrl,
        likes: user._count.likesReceived,
        completed: stats.completed,
        reading: stats.reading,
      };
    });

    return { ranking };
  }

  /**
   * Update manga in user's list
   */
  async updateUserManga(
    userMangaId: string,
    userId: string,
    dto: UpdateMangaListDto,
  ) {
    // Verify ownership
    const userManga = await this.prisma.userManga.findFirst({
      where: {
        id: userMangaId,
        userId,
      },
    });

    if (!userManga) {
      throw new HttpException(
        'Manga not found in your list',
        HttpStatus.NOT_FOUND,
      );
    }

    return this.prisma.userManga.update({
      where: { id: userMangaId },
      data: dto,
      include: {
        manga: true,
      },
    });
  }

  /**
   * Remove manga from user's list
   */
  async removeFromUserList(userMangaId: string, userId: string) {
    const userManga = await this.prisma.userManga.findFirst({
      where: {
        id: userMangaId,
        userId,
      },
    });

    if (!userManga) {
      throw new HttpException(
        'Manga not found in your list',
        HttpStatus.NOT_FOUND,
      );
    }

    await this.prisma.userManga.delete({
      where: { id: userMangaId },
    });

    return { message: 'Manga removed from list' };
  }

  /**
   * Toggle favorite status for a manga in user's list
   */
  async toggleFavorite(userMangaId: string, userId: string) {
    const userManga = await this.prisma.userManga.findFirst({
      where: {
        id: userMangaId,
        userId,
      },
    });

    if (!userManga) {
      throw new HttpException(
        'Manga not found in your list',
        HttpStatus.NOT_FOUND,
      );
    }

    return this.prisma.userManga.update({
      where: { id: userMangaId },
      data: {
        isFavorite: !userManga.isFavorite,
      },
      include: {
        manga: true,
      },
    });
  }

  async getLatestChaptersForUserList(
    userId: string,
  ): Promise<Record<string, LatestChapterDto[]>> {
    const userMangas = await this.prisma.userManga.findMany({
      where: { userId },
      select: {
        manga: {
          select: {
            id: true,
            title: true,
          },
        },
      },
    });

    const uniqueMangas = new Map<string, { id: string; title: string }>();
    for (const entry of userMangas) {
      uniqueMangas.set(entry.manga.id, entry.manga);
    }

    const result: Record<string, LatestChapterDto[]> = {};

    await Promise.all(
      Array.from(uniqueMangas.values()).map(async (manga) => {
        result[manga.id] = await this.getLatestChaptersForManga(
          manga.id,
          manga.title,
        );
      }),
    );

    return result;
  }

  /**
   * Helper: Fetch manga details from Jikan by MAL ID
   */
  private async getMangaFromJikan(
    malId: number,
  ): Promise<JikanMangaSearchResult> {
    const response = await this.fetchWithRetry(
      `${this.JIKAN_BASE_URL}/manga/${malId}`,
    );

    if (!response.ok) {
      throw new HttpException(
        'Manga not found on MyAnimeList',
        HttpStatus.NOT_FOUND,
      );
    }

    const data = await response.json();
    return data.data;
  }

  private parseEnvInt(value: string | undefined, fallback: number): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }

  private async sleep(ms: number) {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  private getRetryDelayMs(attempt: number): number {
    // 250ms, 500ms, 1000ms ...
    return Math.min(250 * 2 ** attempt, 2000);
  }

  private async fetchWithRetry(url: string): Promise<Response> {
    let lastError: unknown;

    for (let attempt = 0; attempt <= this.externalApiRetries; attempt++) {
      const controller = new AbortController();
      const timeout = setTimeout(
        () => controller.abort(),
        this.externalApiTimeoutMs,
      );

      try {
        const response = await fetch(url, { signal: controller.signal });
        clearTimeout(timeout);

        const shouldRetryStatus =
          response.status === 429 || response.status >= 500;

        if (shouldRetryStatus && attempt < this.externalApiRetries) {
          await this.sleep(this.getRetryDelayMs(attempt));
          continue;
        }

        return response;
      } catch (error) {
        clearTimeout(timeout);
        lastError = error;

        if (attempt < this.externalApiRetries) {
          await this.sleep(this.getRetryDelayMs(attempt));
          continue;
        }
      }
    }

    throw lastError ?? new Error('External API request failed');
  }

  private filterNsfwResults(
    data: JikanMangaSearchResult[],
  ): JikanMangaSearchResult[] {
    return data.filter((manga) => !this.isNsfwManga(manga));
  }

  private isNsfwManga(manga: JikanMangaSearchResult): boolean {
    const nsfwTerms = ['hentai', 'erotica', 'adult cast', 'ecchi'];
    const groups = [
      ...(manga.genres ?? []),
      ...(manga.explicit_genres ?? []),
      ...(manga.themes ?? []),
      ...(manga.demographics ?? []),
    ];
    const hasNsfwGenre = groups.some((group) =>
      nsfwTerms.some((term) => group.name.toLowerCase().includes(term)),
    );
    const rating = manga.rating?.toLowerCase() ?? '';
    const hasNsfwRating =
      rating.includes('hentai') ||
      rating.includes('rx') ||
      rating.includes('r+');
    return hasNsfwGenre || hasNsfwRating;
  }

  private async getLatestChaptersForManga(
    mangaId: string,
    title: string,
  ): Promise<LatestChapterDto[]> {
    const cacheKey = `manga:latest-chapters:${mangaId}`;
    const cached = await this.cacheManager.get<LatestChapterDto[]>(cacheKey);
    if (cached) return cached;

    const dexManga = await this.mangaDexService.searchMangaByTitle(title);
    if (!dexManga) {
      await this.cacheManager.set(cacheKey, [], 60 * 60 * 1000);
      return [];
    }

    const latestChapters = await this.mangaDexService.getLatestChapters(
      dexManga.id,
      2,
    );

    await this.cacheManager.set(cacheKey, latestChapters, 60 * 60 * 1000);
    return latestChapters;
  }
}
