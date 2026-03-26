import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Manga } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MangaDexService } from '../mangadex/mangadex.service';
import { ExternalApiHttpClient } from '../common/http/external-api-client';

type JikanSearchItem = {
  mal_id?: number;
  title?: string | null;
  title_english?: string | null;
  title_japanese?: string | null;
  title_synonyms?: string[] | null;
  titles?: Array<{ title?: string | null }> | null;
  status?: string | null;
  authors?: Array<{ name?: string | null }> | null;
  genres?: Array<{ name?: string | null }> | null;
  synopsis?: string | null;
  images?: {
    jpg?: {
      large_image_url?: string | null;
      image_url?: string | null;
    };
  };
};

type AniListSearchItem = {
  id: number;
  idMal?: number | null;
  title?: {
    romaji?: string | null;
    english?: string | null;
    native?: string | null;
  } | null;
  synonyms?: string[] | null;
  description?: string | null;
  status?: string | null;
  genres?: string[] | null;
  coverImage?: {
    large?: string | null;
    medium?: string | null;
  } | null;
  staff?: {
    nodes?: Array<{
      name?: { full?: string | null } | null;
    }> | null;
  } | null;
};

@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);
  private readonly JIKAN_BASE_URL = 'https://api.jikan.moe/v4';
  private readonly ANILIST_GRAPHQL_URL = 'https://graphql.anilist.co';

  constructor(
    private prisma: PrismaService,
    private mangaDexService: MangaDexService,
    private readonly externalApiClient: ExternalApiHttpClient,
  ) {}

  // Enrich metadata for newly created mangas missing key fields.
  @Cron(CronExpression.EVERY_10_MINUTES)
  async handleNewMangaMetadataEnrichment() {
    const retryWindowHours = 6;
    const createdWithinDays = 7;

    const retryCutoff = new Date();
    retryCutoff.setHours(retryCutoff.getHours() - retryWindowHours);

    const createdAfter = new Date();
    createdAfter.setDate(createdAfter.getDate() - createdWithinDays);

    const mangasToEnrich = await this.prisma.manga.findMany({
      where: {
        createdAt: { gte: createdAfter },
        AND: [
          {
            OR: [
              { malId: { lte: 0 } },
              { coverImage: null },
              { author: null },
              { genres: { isEmpty: true } },
              { publicationStatus: null },
              {
                AND: [{ description: null }, { descriptionPt: null }],
              },
            ],
          },
          {
            OR: [{ lastCheckedAt: null }, { lastCheckedAt: { lt: retryCutoff } }],
          },
        ],
      },
      select: {
        id: true,
        malId: true,
        anilistId: true,
        title: true,
        description: true,
        descriptionPt: true,
        coverImage: true,
        author: true,
        genres: true,
        publicationStatus: true,
      },
      take: 20,
      orderBy: [{ createdAt: 'desc' }],
    });

    if (mangasToEnrich.length === 0) {
      return;
    }

    this.logger.log(
      `Enriching metadata for ${mangasToEnrich.length} newly created mangas...`,
    );

    for (const manga of mangasToEnrich) {
      try {
        const { descriptionEn, descriptionPt, publicationStatusFromMangaDex } =
          await this.fetchDescriptionsAndStatusFromMangaDex(manga.title);
        const jikan = await this.searchJikanByTitle(manga.title);
        const anilist = jikan ? null : await this.searchAniListByTitle(manga.title);

        const nextDescription =
          manga.description ??
          descriptionEn ??
          jikan?.synopsis ??
          anilist?.description ??
          null;
        const nextDescriptionPt = manga.descriptionPt ?? descriptionPt ?? null;
        const nextCoverImage = this.selectPreferredCoverImage(
          manga.coverImage,
          jikan?.images?.jpg?.large_image_url ?? jikan?.images?.jpg?.image_url,
          anilist?.coverImage?.large ?? anilist?.coverImage?.medium,
        );
        const nextAuthor =
          manga.author ??
          jikan?.authors?.[0]?.name?.trim() ??
          anilist?.staff?.nodes?.[0]?.name?.full?.trim() ??
          null;
        const jikanGenres = (jikan?.genres ?? [])
          .map((genre) => genre.name?.trim() ?? '')
          .filter((name) => name.length > 0);
        const aniListGenres = (anilist?.genres ?? [])
          .map((genre) => genre.trim())
          .filter((name) => name.length > 0);
        const nextGenres =
          manga.genres.length > 0
            ? manga.genres
            : jikanGenres.length > 0
              ? jikanGenres
              : aniListGenres;
        const nextPublicationStatus =
          manga.publicationStatus ??
          publicationStatusFromMangaDex ??
          jikan?.status ??
          this.mapAniListStatus(anilist?.status ?? null) ??
          null;
        const nextMalId = await this.resolveMalIdCandidate(
          manga.id,
          manga.malId,
          jikan?.mal_id ?? anilist?.idMal ?? undefined,
        );

        await this.prisma.manga.update({
          where: { id: manga.id },
          data: {
            malId: nextMalId,
            anilistId: manga.anilistId ?? anilist?.id ?? null,
            description: nextDescription,
            descriptionPt: nextDescriptionPt,
            coverImage: nextCoverImage,
            author: nextAuthor,
            genres: nextGenres,
            publicationStatus: nextPublicationStatus,
            lastCheckedAt: new Date(),
          },
        });
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : 'Unknown error';
        this.logger.warn(
          `Failed to enrich metadata for ${manga.title} (${manga.id}): ${message}`,
        );
      }
    }
  }

  // Run every hour to check for updates
  @Cron(CronExpression.EVERY_HOUR)
  async handleMangaUpdates() {
    this.logger.log('Checking for manga updates...');

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    // Find mangas that haven't been checked in 7 days or never checked
    // And are not finished/completed
    const mangasToUpdate = await this.prisma.manga.findMany({
      where: {
        OR: [{ lastCheckedAt: { lt: sevenDaysAgo } }, { lastCheckedAt: null }],
        publicationStatus: {
          notIn: ['Finished', 'Discontinued'], // Only update active/ongoing series
        },
      },
      take: 5, // Limit to 5 mangas per run to respect rate limits
      orderBy: {
        lastCheckedAt: 'asc', // Prioritize oldest checks first
      },
    });

    if (mangasToUpdate.length === 0) {
      this.logger.log('No mangas need updates.');
      return;
    }

    this.logger.log(`Found ${mangasToUpdate.length} mangas to update.`);
    let successCount = 0;

    for (const manga of mangasToUpdate) {
      try {
        await this.updateManga(manga);
        successCount++;
        // Add a small delay between requests to be safe
        await new Promise((resolve) => setTimeout(resolve, 1000));
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : 'Unknown error';
        this.logger.error(
          `Failed to update manga ${manga.title} (${manga.id}): ${message}`,
        );
      }
    }

    this.logger.log(`Updated ${successCount}/${mangasToUpdate.length} mangas.`);
  }

  private async updateManga(manga: Manga) {
    this.logger.log(`Updating ${manga.title}...`);

    let dexStatus = null;
    let dexLastChapter = null;

    try {
      // 1. Search MangaDex by title to get ID (if we don't store it)
      // Note: Ideal would be to store MangaDex ID in our DB, but search works for now
      const dexManga = await this.mangaDexService.searchMangaByTitle(
        manga.title,
      );

      if (dexManga) {
        dexStatus = dexManga.attributes.status;
        dexLastChapter = dexManga.attributes.lastChapter;
      }
    } catch {
      this.logger.warn(`Could not fetch from MangaDex for ${manga.title}`);
    }

    // Map Status
    let newStatus = manga.publicationStatus;
    if (dexStatus) {
      if (dexStatus === 'ongoing') newStatus = 'Publishing';
      else if (dexStatus === 'completed') newStatus = 'Finished';
      else if (dexStatus === 'hiatus') newStatus = 'On Hiatus';
      else if (dexStatus === 'cancelled') newStatus = 'Discontinued';
    }

    // Update DB
    await this.prisma.manga.update({
      where: { id: manga.id },
      data: {
        publicationStatus: newStatus,
        lastChapter: dexLastChapter || manga.lastChapter,
        lastCheckedAt: new Date(),
      },
    });
  }

  private async fetchDescriptionsAndStatusFromMangaDex(
    title: string,
  ): Promise<{
    descriptionEn: string | null;
    descriptionPt: string | null;
    publicationStatusFromMangaDex: string | null;
  }> {
    try {
      const dexManga = await this.mangaDexService.searchMangaByTitle(title);
      if (!dexManga) {
        return {
          descriptionEn: null,
          descriptionPt: null,
          publicationStatusFromMangaDex: null,
        };
      }

      const descriptions = await this.mangaDexService.getDescriptions(
        dexManga.id,
      );

      return {
        descriptionEn: descriptions.en,
        descriptionPt: descriptions.pt,
        publicationStatusFromMangaDex: this.mapMangaDexStatus(
          dexManga.attributes.status ?? null,
        ),
      };
    } catch {
      return {
        descriptionEn: null,
        descriptionPt: null,
        publicationStatusFromMangaDex: null,
      };
    }
  }

  private selectPreferredCoverImage(
    existingCover: string | null | undefined,
    jikanCover: string | null | undefined,
    aniListCover: string | null | undefined,
  ): string | null {
    const safeExisting = this.normalizeCoverUrl(existingCover);
    if (safeExisting && !this.isBlockedCoverHost(safeExisting)) {
      return safeExisting;
    }

    const safeJikan = this.normalizeCoverUrl(jikanCover);
    if (safeJikan) return safeJikan;

    const safeAniList = this.normalizeCoverUrl(aniListCover);
    if (safeAniList) return safeAniList;

    return null;
  }

  private normalizeCoverUrl(value: string | null | undefined): string | null {
    const normalized = value?.trim();
    if (!normalized) return null;

    try {
      const parsed = new URL(normalized);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return null;
      }
      return parsed.toString();
    } catch {
      return null;
    }
  }

  private isBlockedCoverHost(url: string): boolean {
    try {
      const host = new URL(url).hostname.toLowerCase();
      return host === 'uploads.mangadex.org' || host.endsWith('.mangadex.org');
    } catch {
      return false;
    }
  }

  private mapMangaDexStatus(status: string | null): string | null {
    if (!status) return null;
    if (status === 'ongoing') return 'Publishing';
    if (status === 'completed') return 'Finished';
    if (status === 'hiatus') return 'On Hiatus';
    if (status === 'cancelled') return 'Discontinued';
    return null;
  }

  private mapAniListStatus(status: string | null): string | null {
    if (!status) return null;
    if (status === 'RELEASING') return 'Publishing';
    if (status === 'FINISHED') return 'Finished';
    if (status === 'HIATUS') return 'On Hiatus';
    if (status === 'CANCELLED') return 'Discontinued';
    return null;
  }

  private async resolveMalIdCandidate(
    mangaId: string,
    currentMalId: number,
    jikanMalId: number | undefined,
  ): Promise<number> {
    if (!jikanMalId || jikanMalId <= 0) {
      return currentMalId;
    }

    if (currentMalId > 0) {
      return currentMalId;
    }

    const existing = await this.prisma.manga.findFirst({
      where: {
        malId: jikanMalId,
        id: { not: mangaId },
      },
      select: { id: true },
    });

    if (existing) {
      return currentMalId;
    }

    return jikanMalId;
  }

  private async searchJikanByTitle(
    title: string,
  ): Promise<JikanSearchItem | null> {
    const query = encodeURIComponent(title.trim());
    const url = `${this.JIKAN_BASE_URL}/manga?q=${query}&limit=10`;
    const payload = await this.externalApiClient.fetchJsonWithRetry<{
      data?: JikanSearchItem[];
    }>(url, 'jikan');

    if (!payload?.data?.length) {
      return null;
    }

    const normalizedQuery = this.normalizeTitle(title);
    let best: { item: JikanSearchItem; score: number } | null = null;

    for (const item of payload.data) {
      const candidateTitles = this.extractCandidateTitles(item);
      const score = this.computeBestTitleScore(normalizedQuery, candidateTitles);
      if (!best || score > best.score) {
        best = { item, score };
      }
    }

    const minScore = this.minimumScoreForQuery(normalizedQuery, 0.95);
    if (!best || best.score < minScore) {
      return null;
    }

    return best.item;
  }

  private async searchAniListByTitle(
    title: string,
  ): Promise<AniListSearchItem | null> {
    const query = `
      query ($search: String!, $page: Int!, $perPage: Int!) {
        Page(page: $page, perPage: $perPage) {
          media(search: $search, type: MANGA, sort: POPULARITY_DESC) {
            id
            idMal
            title {
              romaji
              english
              native
            }
            synonyms
            description(asHtml: false)
            status
            genres
            coverImage {
              large
              medium
            }
            staff {
              nodes {
                name {
                  full
                }
              }
            }
          }
        }
      }
    `;

    const response = await fetch(this.ANILIST_GRAPHQL_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        query,
        variables: {
          search: title,
          page: 1,
          perPage: 10,
        },
      }),
    });

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as {
      data?: {
        Page?: {
          media?: AniListSearchItem[];
        };
      };
    };

    const candidates = payload?.data?.Page?.media ?? [];
    if (candidates.length === 0) {
      return null;
    }

    const normalizedQuery = this.normalizeTitle(title);
    let best: { item: AniListSearchItem; score: number } | null = null;

    for (const item of candidates) {
      const candidateTitles = [
        item.title?.english,
        item.title?.romaji,
        item.title?.native,
        ...(item.synonyms ?? []),
      ].filter((value): value is string => !!value);

      const score = this.computeBestTitleScore(normalizedQuery, candidateTitles);
      if (!best || score > best.score) {
        best = { item, score };
      }
    }

    const minScore = this.minimumScoreForQuery(normalizedQuery, 0.85);
    if (!best || best.score < minScore) {
      return null;
    }

    return best.item;
  }

  private extractCandidateTitles(item: JikanSearchItem): string[] {
    const fromTitles = (item.titles ?? [])
      .map((entry) => entry?.title ?? null)
      .filter((value): value is string => !!value);

    const candidates = [
      item.title,
      item.title_english,
      item.title_japanese,
      ...(item.title_synonyms ?? []),
      ...fromTitles,
    ].filter((value): value is string => !!value);

    return Array.from(new Set(candidates.map((value) => value.trim())));
  }

  private computeBestTitleScore(query: string, candidates: string[]): number {
    let best = 0;
    for (const rawCandidate of candidates) {
      const candidate = this.normalizeTitle(rawCandidate);
      if (!candidate) continue;
      if (candidate === query) return 1;
      if (candidate.includes(query) || query.includes(candidate)) {
        best = Math.max(best, 0.85);
      }

      const tokenScore = this.computeTokenJaccard(query, candidate);
      best = Math.max(best, tokenScore);
    }
    return best;
  }

  private computeTokenJaccard(left: string, right: string): number {
    const leftTokens = new Set(left.split(' ').filter(Boolean));
    const rightTokens = new Set(right.split(' ').filter(Boolean));
    if (leftTokens.size === 0 || rightTokens.size === 0) return 0;

    let intersection = 0;
    for (const token of leftTokens) {
      if (rightTokens.has(token)) {
        intersection++;
      }
    }

    const union = new Set([...leftTokens, ...rightTokens]).size;
    return union === 0 ? 0 : intersection / union;
  }

  private minimumScoreForQuery(
    normalizedQuery: string,
    defaultMinScore: number,
  ): number {
    const tokenCount = normalizedQuery.split(' ').filter(Boolean).length;
    if (tokenCount <= 2) {
      return 1;
    }
    return defaultMinScore;
  }

  private normalizeTitle(value: string): string {
    return value
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
}
