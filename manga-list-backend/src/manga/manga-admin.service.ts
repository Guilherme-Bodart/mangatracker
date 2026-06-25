import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { MangaStatus, Prisma } from '@prisma/client';
import { ExternalApiHttpClient } from '../common/http/external-api-client';
import { MangaDexService } from '../mangadex/mangadex.service';
import { PrismaService } from '../prisma/prisma.service';

type AdminDuplicateItem = {
  id: string;
  title: string;
  malId: number;
  anilistId: number | null;
  coverImage: string | null;
  userEntries: number;
  externalMaps: number;
  score: number;
  updatedAt: string;
};

type AdminMissingCoverItem = AdminDuplicateItem;

type CoverRepairResult = {
  mangaId: string;
  title: string;
  previousCoverImage: string | null;
  coverImage: string | null;
  changed: boolean;
  source: 'anilist' | 'jikan' | 'mangadex' | 'manual' | 'unchanged';
};

type JikanSearchItem = {
  title?: string | null;
  title_english?: string | null;
  title_japanese?: string | null;
  title_synonyms?: string[] | null;
  titles?: Array<{ title?: string | null }> | null;
  images?: {
    jpg?: {
      large_image_url?: string | null;
      image_url?: string | null;
    };
  };
};

type AniListSearchItem = {
  title?: {
    romaji?: string | null;
    english?: string | null;
    native?: string | null;
  } | null;
  synonyms?: string[] | null;
  coverImage?: {
    large?: string | null;
    medium?: string | null;
  } | null;
};

@Injectable()
export class MangaAdminService {
  private readonly ANILIST_GRAPHQL_URL = 'https://graphql.anilist.co';
  private readonly JIKAN_BASE_URL = 'https://api.jikan.moe/v4';

  constructor(
    private readonly prisma: PrismaService,
    private readonly mangaDexService: MangaDexService,
    private readonly externalApiHttpClient: ExternalApiHttpClient,
  ) {}

  async listDuplicateGroups(limit = 30) {
    const safeLimit = Math.max(1, Math.min(limit, 100));

    const mangas = await this.prisma.manga.findMany({
      select: {
        id: true,
        title: true,
        malId: true,
        anilistId: true,
        coverImage: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            userMangas: true,
            externalMangaMaps: true,
          },
        },
      },
      orderBy: [{ updatedAt: 'desc' }],
      take: 4000,
    });

    const grouped = new Map<string, typeof mangas>();
    for (const manga of mangas) {
      const key = this.normalizeTitle(manga.title);
      if (key.length < 4) continue;
      const current = grouped.get(key) ?? [];
      current.push(manga);
      grouped.set(key, current);
    }

    const groups = Array.from(grouped.entries())
      .filter(([, items]) => items.length > 1)
      .map(([normalizedTitle, items]) => {
        const mappedItems: AdminDuplicateItem[] = items
          .map((item) => ({
            id: item.id,
            title: item.title,
            malId: item.malId,
            anilistId: item.anilistId,
            coverImage: this.normalizeCoverUrl(item.coverImage),
            userEntries: item._count.userMangas,
            externalMaps: item._count.externalMangaMaps,
            score: this.computeCanonicalScore(item),
            updatedAt: item.updatedAt.toISOString(),
          }))
          .sort((a, b) => b.score - a.score);

        const canonical = mappedItems[0];
        const totalReferences = mappedItems.reduce(
          (acc, item) => acc + item.userEntries + item.externalMaps,
          0,
        );

        return {
          normalizedTitle,
          canonicalMangaId: canonical.id,
          canonicalTitle: canonical.title,
          totalItems: mappedItems.length,
          totalReferences,
          items: mappedItems,
        };
      })
      .sort((a, b) => {
        if (b.totalReferences !== a.totalReferences) {
          return b.totalReferences - a.totalReferences;
        }
        return b.totalItems - a.totalItems;
      })
      .slice(0, safeLimit);

    return {
      totalGroups: groups.length,
      groups,
    };
  }

  async listMissingCovers(limit = 50) {
    const safeLimit = Math.max(1, Math.min(limit, 200));
    const mangas = await this.prisma.manga.findMany({
      where: {
        OR: [{ coverImage: null }, { coverImage: '' }],
      },
      select: {
        id: true,
        title: true,
        malId: true,
        anilistId: true,
        coverImage: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            userMangas: true,
            externalMangaMaps: true,
          },
        },
      },
      orderBy: [{ updatedAt: 'desc' }],
      take: safeLimit,
    });

    const items: AdminMissingCoverItem[] = mangas.map((item) => ({
      id: item.id,
      title: item.title,
      malId: item.malId,
      anilistId: item.anilistId,
      coverImage: this.normalizeCoverUrl(item.coverImage),
      userEntries: item._count.userMangas,
      externalMaps: item._count.externalMangaMaps,
      score: this.computeCanonicalScore(item),
      updatedAt: item.updatedAt.toISOString(),
    }));

    return {
      total: items.length,
      items,
    };
  }

  async mergeDuplicateGroup(canonicalMangaId: string, duplicateMangaIds: string[]) {
    const uniqueDuplicateIds = Array.from(
      new Set(
        duplicateMangaIds
          .map((id) => id.trim())
          .filter((id) => id.length > 0 && id !== canonicalMangaId),
      ),
    );

    if (uniqueDuplicateIds.length === 0) {
      throw new BadRequestException('No duplicate ids provided for merge');
    }

    const canonical = await this.prisma.manga.findUnique({
      where: { id: canonicalMangaId },
      select: { id: true, title: true },
    });
    if (!canonical) {
      throw new NotFoundException('Canonical manga not found');
    }

    const summary = {
      canonicalMangaId: canonical.id,
      canonicalTitle: canonical.title,
      processedDuplicates: uniqueDuplicateIds.length,
      movedUserEntries: 0,
      mergedUserEntries: 0,
      movedExternalMaps: 0,
      deletedMangas: 0,
      skippedMangas: 0,
    };

    await this.prisma.$transaction(async (tx) => {
      for (const duplicateId of uniqueDuplicateIds) {
        const duplicate = await tx.manga.findUnique({
          where: { id: duplicateId },
          select: { id: true },
        });
        if (!duplicate) {
          summary.skippedMangas += 1;
          continue;
        }

        const duplicateEntries = await tx.userManga.findMany({
          where: { mangaId: duplicate.id },
          select: {
            id: true,
            userId: true,
            mangaId: true,
            status: true,
            rating: true,
            currentChapter: true,
            notes: true,
            isFavorite: true,
          },
        });

        for (const sourceEntry of duplicateEntries) {
          const canonicalEntry = await tx.userManga.findUnique({
            where: {
              userId_mangaId: {
                userId: sourceEntry.userId,
                mangaId: canonical.id,
              },
            },
            select: {
              id: true,
              status: true,
              rating: true,
              currentChapter: true,
              notes: true,
              isFavorite: true,
            },
          });

          if (!canonicalEntry) {
            await tx.userManga.update({
              where: { id: sourceEntry.id },
              data: { mangaId: canonical.id },
            });
            summary.movedUserEntries += 1;
            continue;
          }

          await tx.userManga.update({
            where: { id: canonicalEntry.id },
            data: {
              status: this.selectPreferredStatus(
                canonicalEntry.status,
                sourceEntry.status,
              ),
              rating: this.selectPreferredRating(
                canonicalEntry.rating,
                sourceEntry.rating,
              ),
              currentChapter: this.selectPreferredChapter(
                canonicalEntry.currentChapter,
                sourceEntry.currentChapter,
              ),
              notes: this.selectPreferredNotes(
                canonicalEntry.notes,
                sourceEntry.notes,
              ),
              isFavorite: canonicalEntry.isFavorite || sourceEntry.isFavorite,
            },
          });

          await tx.userManga.delete({
            where: { id: sourceEntry.id },
          });

          summary.mergedUserEntries += 1;
        }

        const mapCount = await tx.externalMangaMap.count({
          where: { mangaId: duplicate.id },
        });
        if (mapCount > 0) {
          await tx.externalMangaMap.updateMany({
            where: { mangaId: duplicate.id },
            data: { mangaId: canonical.id },
          });
          summary.movedExternalMaps += mapCount;
        }

        const stillReferenced = await this.countMangaReferences(tx, duplicate.id);
        if (stillReferenced === 0) {
          await tx.manga.delete({
            where: { id: duplicate.id },
          });
          summary.deletedMangas += 1;
        } else {
          summary.skippedMangas += 1;
        }
      }
    });

    return summary;
  }

  async repairCoverByMangaId(mangaId: string) {
    const manga = await this.prisma.manga.findUnique({
      where: { id: mangaId },
      select: {
        id: true,
        title: true,
        coverImage: true,
      },
    });

    if (!manga) {
      throw new NotFoundException('Manga not found');
    }

    const result = await this.resolveBestCoverForManga(manga);
    if (result.changed) {
      await this.prisma.manga.update({
        where: { id: manga.id },
        data: { coverImage: result.coverImage },
      });
    }

    return result;
  }

  async updateCoverManually(mangaId: string, coverImage: string) {
    const manga = await this.prisma.manga.findUnique({
      where: { id: mangaId },
      select: {
        id: true,
        title: true,
        coverImage: true,
      },
    });

    if (!manga) {
      throw new NotFoundException('Manga not found');
    }

    const normalizedCover = this.normalizeCoverUrl(coverImage);
    if (!normalizedCover) {
      throw new BadRequestException('Invalid cover image URL');
    }

    const previousCoverImage = this.normalizeCoverUrl(manga.coverImage);
    await this.prisma.manga.update({
      where: { id: manga.id },
      data: { coverImage: normalizedCover },
    });

    return {
      mangaId: manga.id,
      title: manga.title,
      previousCoverImage,
      coverImage: normalizedCover,
      changed: previousCoverImage !== normalizedCover,
      source: 'manual' as const,
    };
  }

  async repairMissingCovers(limit = 100, apply = false) {
    const safeLimit = Math.max(1, Math.min(limit, 25));
    const targets = await this.prisma.manga.findMany({
      where: {
        OR: [{ coverImage: null }, { coverImage: '' }],
      },
      select: {
        id: true,
        title: true,
        coverImage: true,
      },
      orderBy: [{ updatedAt: 'desc' }],
      take: safeLimit,
    });

    const results: CoverRepairResult[] = [];
    for (const manga of targets) {
      const result = await this.resolveBestCoverForManga(manga);
      results.push(result);

      if (apply && result.changed) {
        await this.prisma.manga.update({
          where: { id: manga.id },
          data: { coverImage: result.coverImage },
        });
      }
    }

    return {
      total: targets.length,
      updated: results.filter((item) => item.changed && item.coverImage).length,
      unresolved: results.filter((item) => !item.coverImage).length,
      apply,
      results,
    };
  }

  private async countMangaReferences(
    tx: Prisma.TransactionClient,
    mangaId: string,
  ) {
    const [userMangaCount, externalMapCount] = await Promise.all([
      tx.userManga.count({ where: { mangaId } }),
      tx.externalMangaMap.count({ where: { mangaId } }),
    ]);
    return userMangaCount + externalMapCount;
  }

  private selectPreferredStatus(
    left: MangaStatus,
    right: MangaStatus,
  ): MangaStatus {
    const rank: Record<MangaStatus, number> = {
      COMPLETED: 4,
      READING: 3,
      PLAN_TO_READ: 2,
      DROPPED: 1,
    };
    return rank[right] > rank[left] ? right : left;
  }

  private selectPreferredRating(
    left: number | null,
    right: number | null,
  ): number | null {
    if (left === null) return right;
    if (right === null) return left;
    return Math.max(left, right);
  }

  private selectPreferredChapter(
    left: number | null,
    right: number | null,
  ): number | null {
    if (left === null) return right;
    if (right === null) return left;
    return Math.max(left, right);
  }

  private selectPreferredNotes(
    left: string | null,
    right: string | null,
  ): string | null {
    const normalizedLeft = left?.trim() ?? '';
    const normalizedRight = right?.trim() ?? '';
    if (!normalizedLeft && !normalizedRight) return null;
    if (!normalizedLeft) return normalizedRight;
    if (!normalizedRight) return normalizedLeft;
    return normalizedLeft.length >= normalizedRight.length
      ? normalizedLeft
      : normalizedRight;
  }

  private computeCanonicalScore(item: {
    malId: number;
    anilistId: number | null;
    coverImage: string | null;
    createdAt: Date;
    updatedAt: Date;
    _count: {
      userMangas: number;
      externalMangaMaps: number;
    };
  }): number {
    const hasPositiveMalId = item.malId > 0;
    const hasCover = !!this.normalizeCoverUrl(item.coverImage);
    const refs = item._count.userMangas * 5 + item._count.externalMangaMaps * 8;
    const recencyBonus = Math.max(
      0,
      Math.round((item.updatedAt.getTime() - item.createdAt.getTime()) / 86_400_000),
    );

    return (
      refs +
      (item.anilistId ? 500 : 0) +
      (hasPositiveMalId ? 250 : 0) +
      (hasCover ? 100 : 0) +
      recencyBonus
    );
  }

  private normalizeTitle(value: string): string {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private normalizeCoverUrl(value: string | null | undefined): string | null {
    const normalized = String(value || '').trim();
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

  private computeTitleSimilarity(left: string, right: string): number {
    const normalizedLeft = this.normalizeTitle(left);
    const normalizedRight = this.normalizeTitle(right);
    if (!normalizedLeft || !normalizedRight) {
      return 0;
    }

    if (normalizedLeft === normalizedRight) {
      return 1;
    }

    if (
      normalizedLeft.includes(normalizedRight) ||
      normalizedRight.includes(normalizedLeft)
    ) {
      return 0.93;
    }

    const leftTokens = new Set(normalizedLeft.split(' ').filter(Boolean));
    const rightTokens = new Set(normalizedRight.split(' ').filter(Boolean));
    if (leftTokens.size === 0 || rightTokens.size === 0) {
      return 0;
    }

    let intersection = 0;
    for (const token of leftTokens) {
      if (rightTokens.has(token)) {
        intersection += 1;
      }
    }

    const union = new Set([...leftTokens, ...rightTokens]).size;
    return union === 0 ? 0 : intersection / union;
  }

  private pickBestTitleMatch<T>(
    query: string,
    items: T[],
    extractTitles: (item: T) => string[],
    minScore: number,
  ): T | null {
    let best: { item: T; score: number } | null = null;
    for (const item of items) {
      const titles = extractTitles(item).filter((value) => value.trim().length > 0);
      const score = titles.reduce((acc, title) => {
        const similarity = this.computeTitleSimilarity(query, title);
        return similarity > acc ? similarity : acc;
      }, 0);
      if (!best || score > best.score) {
        best = { item, score };
      }
    }
    if (!best || best.score < minScore) {
      return null;
    }
    return best.item;
  }

  private async findJikanCover(title: string): Promise<string | null> {
    const url = `${this.JIKAN_BASE_URL}/manga?q=${encodeURIComponent(title)}&limit=10`;
    const payload = await this.externalApiHttpClient.fetchJsonWithRetry<{
      data?: JikanSearchItem[];
    }>(url, 'jikan');

    const candidates = payload?.data ?? [];
    if (candidates.length === 0) {
      return null;
    }

    const best = this.pickBestTitleMatch(
      title,
      candidates,
      (item) => [
        item.title ?? '',
        item.title_english ?? '',
        item.title_japanese ?? '',
        ...(item.title_synonyms ?? []),
        ...(item.titles?.map((entry) => entry.title ?? '') ?? []),
      ],
      0.86,
    );
    if (!best) {
      return null;
    }

    return (
      best.images?.jpg?.large_image_url?.trim() ??
      best.images?.jpg?.image_url?.trim() ??
      null
    );
  }

  private async findAniListCover(title: string): Promise<string | null> {
    const query = `
      query ($search: String!, $page: Int!, $perPage: Int!) {
        Page(page: $page, perPage: $perPage) {
          media(search: $search, type: MANGA, sort: POPULARITY_DESC) {
            title {
              romaji
              english
              native
            }
            synonyms
            coverImage {
              large
              medium
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

    const best = this.pickBestTitleMatch(
      title,
      candidates,
      (item) => [
        item.title?.english ?? '',
        item.title?.romaji ?? '',
        item.title?.native ?? '',
        ...(item.synonyms ?? []),
      ],
      0.8,
    );
    if (!best) {
      return null;
    }

    return best.coverImage?.large?.trim() ?? best.coverImage?.medium?.trim() ?? null;
  }

  private async findMangaDexCover(title: string): Promise<string | null> {
    try {
      const manga = await this.mangaDexService.searchMangaByTitle(title);
      if (!manga) {
        return null;
      }
      return (await this.mangaDexService.getCoverImageUrl(manga.id))?.trim() ?? null;
    } catch {
      return null;
    }
  }

  private async resolveBestCoverForManga(manga: {
    id: string;
    title: string;
    coverImage: string | null;
  }): Promise<CoverRepairResult> {
    const normalizedCurrent = this.normalizeCoverUrl(manga.coverImage);
    const providerResult = await this.findFirstAvailableCover(manga.title);
    const nextCover = providerResult.coverImage ?? normalizedCurrent;
    const source: CoverRepairResult['source'] =
      providerResult.coverImage && providerResult.source
        ? providerResult.source
        : 'unchanged';

    return {
      mangaId: manga.id,
      title: manga.title,
      previousCoverImage: normalizedCurrent,
      coverImage: nextCover,
      changed: normalizedCurrent !== nextCover,
      source,
    };
  }

  private async findFirstAvailableCover(title: string): Promise<{
    coverImage: string | null;
    source: Exclude<CoverRepairResult['source'], 'unchanged'> | null;
  }> {
    const providers: Array<{
      source: Exclude<CoverRepairResult['source'], 'unchanged'>;
      find: (title: string) => Promise<string | null>;
    }> = [
      { source: 'anilist', find: (value) => this.findAniListCover(value) },
      { source: 'jikan', find: (value) => this.findJikanCover(value) },
      { source: 'mangadex', find: (value) => this.findMangaDexCover(value) },
    ];

    for (const provider of providers) {
      const cover = this.normalizeCoverUrl(await provider.find(title));
      if (cover) {
        return { coverImage: cover, source: provider.source };
      }
    }

    return { coverImage: null, source: null };
  }
}
