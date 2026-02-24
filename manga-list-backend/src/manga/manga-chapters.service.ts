import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MangaDexService } from '../mangadex/mangadex.service';
import { MangaUpdatesService } from '../mangaupdates/mangaupdates.service';

export type LatestChapterDto = {
  chapter: string;
  title: string | null;
  publishedAt: string | null;
};

@Injectable()
export class MangaChaptersService {
  private readonly latestChaptersConcurrency = this.parseEnvInt(
    process.env.LATEST_CHAPTERS_CONCURRENCY,
    4,
  );

  constructor(
    private readonly prisma: PrismaService,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
    private readonly mangaDexService: MangaDexService,
    private readonly mangaUpdatesService: MangaUpdatesService,
  ) {}

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
    const mangas = Array.from(uniqueMangas.values());

    await this.runWithConcurrencyLimit(
      mangas,
      this.latestChaptersConcurrency,
      async (manga) => {
        result[manga.id] = await this.getLatestChaptersForManga(
          manga.id,
          manga.title,
        );
      },
    );

    return result;
  }

  private async getLatestChaptersForManga(
    mangaId: string,
    title: string,
  ): Promise<LatestChapterDto[]> {
    const cacheKey = `manga:latest-chapters:${mangaId}`;
    const cached = await this.cacheManager.get<LatestChapterDto[]>(cacheKey);
    if (cached) return cached;

    const dexManga = await this.mangaDexService.searchMangaByTitle(title);
    let latestChapters: LatestChapterDto[] = [];

    if (dexManga) {
      latestChapters = await this.mangaDexService.getLatestChapters(dexManga.id, 2);
    }

    if (latestChapters.length === 0) {
      latestChapters = await this.mangaUpdatesService.getLatestChaptersByTitle(
        title,
      );
    }

    await this.cacheManager.set(cacheKey, latestChapters, 60 * 60 * 1000);
    return latestChapters;
  }

  private async runWithConcurrencyLimit<T>(
    items: T[],
    limit: number,
    worker: (item: T) => Promise<void>,
  ): Promise<void> {
    if (items.length === 0) {
      return;
    }

    const safeLimit = Math.max(1, Math.min(limit, items.length));
    let cursor = 0;

    const workers = Array.from({ length: safeLimit }, async () => {
      while (true) {
        const index = cursor++;
        if (index >= items.length) {
          return;
        }

        await worker(items[index]);
      }
    });

    await Promise.all(workers);
  }

  private parseEnvInt(value: string | undefined, fallback: number): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }
}
