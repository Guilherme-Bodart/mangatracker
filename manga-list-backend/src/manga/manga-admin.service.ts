import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
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
  source: 'anilist' | 'jikan' | 'mangadex' | 'unchanged';
};

type FullMangaRepairResult = {
  mangaId: string;
  previous: {
    title: string;
    malId: number;
    anilistId: number | null;
    coverImage: string | null;
  };
  manga: {
    title: string;
    malId: number;
    anilistId: number | null;
    coverImage: string | null;
    author: string | null;
    genres: string[];
    totalChapters: number | null;
    description: string | null;
    descriptionPt: string | null;
    publicationStatus: string | null;
    lastChapter: string | null;
  };
  changed: boolean;
  searchedTitles: string[];
  matchedTitle: string | null;
  sources: string[];
  skippedUniqueFields: Array<'malId' | 'anilistId'>;
};

type JikanSearchItem = {
  mal_id?: number | null;
  title?: string | null;
  title_english?: string | null;
  title_japanese?: string | null;
  title_synonyms?: string[] | null;
  titles?: Array<{ title?: string | null }> | null;
  status?: string | null;
  chapters?: number | null;
  synopsis?: string | null;
  authors?: Array<{ name?: string | null }> | null;
  genres?: Array<{ name?: string | null }> | null;
  images?: {
    jpg?: {
      large_image_url?: string | null;
      image_url?: string | null;
    };
  };
};

type AniListSearchItem = {
  id?: number | null;
  idMal?: number | null;
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
  genres?: string[] | null;
  chapters?: number | null;
  description?: string | null;
  status?: string | null;
  staff?: {
    nodes?: Array<{ name?: { full?: string | null } | null }> | null;
  } | null;
};

type MangaDexMetadata = {
  id: string;
  title: string | null;
  titles: string[];
  coverImage: string | null;
  description: string | null;
  descriptionPt: string | null;
  publicationStatus: string | null;
  lastChapter: string | null;
};

type MangaUpdatesSearchResponse = {
  results?: Array<{
    record?: {
      series_id?: number;
      title?: string | null;
    };
    hit_title?: string | null;
  }>;
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

  async mergeDuplicateGroup(
    canonicalMangaId: string,
    duplicateMangaIds: string[],
  ) {
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

        const stillReferenced = await this.countMangaReferences(
          tx,
          duplicate.id,
        );
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

  async repairFullMangaById(mangaId: string): Promise<FullMangaRepairResult> {
    const manga = await this.prisma.manga.findUnique({
      where: { id: mangaId },
      select: {
        id: true,
        malId: true,
        anilistId: true,
        title: true,
        coverImage: true,
        author: true,
        genres: true,
        totalChapters: true,
        description: true,
        descriptionPt: true,
        publicationStatus: true,
        lastChapter: true,
      },
    });

    if (!manga) {
      throw new NotFoundException('Manga not found');
    }

    const metadata = await this.resolveRepairMetadata(manga.title);
    const skippedUniqueFields: FullMangaRepairResult['skippedUniqueFields'] =
      [];

    const updateData: Prisma.MangaUpdateInput = {};
    if (metadata.title && metadata.title !== manga.title) {
      updateData.title = metadata.title;
    }

    const nextMalId = this.resolvePositiveNumber(
      metadata.jikan?.mal_id,
      metadata.anilist?.idMal,
    );
    if (nextMalId && nextMalId !== manga.malId) {
      if (await this.canUseMalId(nextMalId, manga.id)) {
        updateData.malId = nextMalId;
      } else {
        skippedUniqueFields.push('malId');
      }
    }

    const nextAniListId = this.resolvePositiveNumber(metadata.anilist?.id);
    if (nextAniListId && nextAniListId !== manga.anilistId) {
      if (await this.canUseAniListId(nextAniListId, manga.id)) {
        updateData.anilistId = nextAniListId;
      } else {
        skippedUniqueFields.push('anilistId');
      }
    }

    const nextCoverImage = this.normalizeCoverUrl(
      metadata.coverImage ?? manga.coverImage,
    );
    if (
      nextCoverImage &&
      nextCoverImage !== this.normalizeCoverUrl(manga.coverImage)
    ) {
      updateData.coverImage = nextCoverImage;
    }

    const nextAuthor = this.firstNonEmpty(
      metadata.jikan?.authors?.[0]?.name,
      metadata.anilist?.staff?.nodes?.[0]?.name?.full,
    );
    if (nextAuthor && nextAuthor !== manga.author) {
      updateData.author = nextAuthor;
    }

    const nextGenres = this.resolveGenres(metadata.jikan, metadata.anilist);
    if (
      nextGenres.length > 0 &&
      !this.sameStringArray(nextGenres, manga.genres)
    ) {
      updateData.genres = nextGenres;
    }

    const nextTotalChapters = this.resolvePositiveNumber(
      metadata.jikan?.chapters,
      metadata.anilist?.chapters,
    );
    if (nextTotalChapters && nextTotalChapters !== manga.totalChapters) {
      updateData.totalChapters = nextTotalChapters;
    }

    const nextDescription = this.firstNonEmpty(
      metadata.mangaDex?.description,
      metadata.jikan?.synopsis,
      metadata.anilist?.description,
    );
    if (nextDescription && nextDescription !== manga.description) {
      updateData.description = nextDescription;
    }

    if (
      metadata.mangaDex?.descriptionPt &&
      metadata.mangaDex.descriptionPt !== manga.descriptionPt
    ) {
      updateData.descriptionPt = metadata.mangaDex.descriptionPt;
    }

    const nextPublicationStatus = this.firstNonEmpty(
      this.mapMangaDexStatus(metadata.mangaDex?.publicationStatus),
      metadata.jikan?.status,
      this.mapAniListStatus(metadata.anilist?.status),
    );
    if (
      nextPublicationStatus &&
      nextPublicationStatus !== manga.publicationStatus
    ) {
      updateData.publicationStatus = nextPublicationStatus;
    }

    if (
      metadata.mangaDex?.lastChapter &&
      metadata.mangaDex.lastChapter !== manga.lastChapter
    ) {
      updateData.lastChapter = metadata.mangaDex.lastChapter;
    }

    if (Object.keys(updateData).length > 0) {
      updateData.lastCheckedAt = new Date();
    }

    const updated =
      Object.keys(updateData).length > 0
        ? await this.prisma.manga.update({
            where: { id: manga.id },
            data: updateData,
            select: {
              title: true,
              malId: true,
              anilistId: true,
              coverImage: true,
              author: true,
              genres: true,
              totalChapters: true,
              description: true,
              descriptionPt: true,
              publicationStatus: true,
              lastChapter: true,
            },
          })
        : manga;

    return {
      mangaId: manga.id,
      previous: {
        title: manga.title,
        malId: manga.malId,
        anilistId: manga.anilistId,
        coverImage: this.normalizeCoverUrl(manga.coverImage),
      },
      manga: {
        title: updated.title,
        malId: updated.malId,
        anilistId: updated.anilistId,
        coverImage: this.normalizeCoverUrl(updated.coverImage),
        author: updated.author,
        genres: updated.genres,
        totalChapters: updated.totalChapters,
        description: updated.description,
        descriptionPt: updated.descriptionPt,
        publicationStatus: updated.publicationStatus,
        lastChapter: updated.lastChapter,
      },
      changed: Object.keys(updateData).length > 0,
      searchedTitles: metadata.searchedTitles,
      matchedTitle: metadata.title,
      sources: metadata.sources,
      skippedUniqueFields,
    };
  }

  async repairMissingCovers(limit = 100, apply = false) {
    const safeLimit = Math.max(1, Math.min(limit, 1000));
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

  private async resolveRepairMetadata(originalTitle: string): Promise<{
    title: string | null;
    coverImage: string | null;
    jikan: JikanSearchItem | null;
    anilist: AniListSearchItem | null;
    mangaDex: MangaDexMetadata | null;
    searchedTitles: string[];
    sources: string[];
  }> {
    const searchedTitles = this.uniqueTitles([originalTitle]);
    const sources: string[] = [];

    let mangaDex = await this.findMangaDexMetadata(originalTitle);
    if (mangaDex) {
      sources.push('mangadex');
      searchedTitles.push(...this.uniqueTitles(mangaDex.titles));
    }

    const mangaUpdatesTitles = await this.findMangaUpdatesTitles(originalTitle);
    if (mangaUpdatesTitles.length > 0) {
      sources.push('mangaupdates');
      searchedTitles.push(...mangaUpdatesTitles);
    }

    if (!mangaDex) {
      for (const title of this.uniqueTitles(searchedTitles).slice(1, 6)) {
        mangaDex = await this.findMangaDexMetadata(title);
        if (mangaDex) {
          sources.push('mangadex');
          searchedTitles.push(...this.uniqueTitles(mangaDex.titles));
          break;
        }
      }
    }

    const titleCandidates = this.uniqueTitles(searchedTitles).slice(0, 6);
    const anilist = await this.findFirstAniListMetadata(titleCandidates);
    if (anilist) {
      sources.push('anilist');
      searchedTitles.push(...this.extractAniListTitles(anilist));
    }

    const jikan = await this.findFirstJikanMetadata(
      this.uniqueTitles(searchedTitles).slice(0, 8),
    );
    if (jikan) {
      sources.push('jikan');
      searchedTitles.push(...this.extractJikanTitles(jikan));
    }

    const finalTitles = this.uniqueTitles(searchedTitles);
    const coverImage = this.normalizeCoverUrl(
      this.firstNonEmpty(
        anilist?.coverImage?.large,
        anilist?.coverImage?.medium,
        jikan?.images?.jpg?.large_image_url,
        jikan?.images?.jpg?.image_url,
        mangaDex?.coverImage,
      ),
    );

    const fallbackCoverImage =
      coverImage ?? (await this.resolveBestCoverForTitles(finalTitles));

    return {
      title: this.resolveEnglishTitle(anilist, jikan, mangaDex),
      coverImage: fallbackCoverImage,
      jikan,
      anilist,
      mangaDex,
      searchedTitles: finalTitles,
      sources,
    };
  }

  private async findFirstAniListMetadata(
    titles: string[],
  ): Promise<AniListSearchItem | null> {
    for (const title of titles) {
      const result = await this.findAniListMetadata(title);
      if (result) return result;
    }
    return null;
  }

  private async findFirstJikanMetadata(
    titles: string[],
  ): Promise<JikanSearchItem | null> {
    for (const title of titles) {
      const result = await this.findJikanMetadata(title);
      if (result) return result;
    }
    return null;
  }

  private async resolveBestCoverForTitles(
    titles: string[],
  ): Promise<string | null> {
    for (const title of titles.slice(0, 8)) {
      const result = await this.resolveBestCoverForManga({
        id: 'preview',
        title,
        coverImage: null,
      });
      if (result.coverImage) {
        return result.coverImage;
      }
    }
    return null;
  }

  private async findJikanMetadata(
    title: string,
  ): Promise<JikanSearchItem | null> {
    const url = `${this.JIKAN_BASE_URL}/manga?q=${encodeURIComponent(title)}&limit=10`;
    const payload = await this.externalApiHttpClient.fetchJsonWithRetry<{
      data?: JikanSearchItem[];
    }>(url, 'jikan');

    const candidates = payload?.data ?? [];
    if (candidates.length === 0) {
      return null;
    }

    return this.pickBestTitleMatch(
      title,
      candidates,
      (item) => this.extractJikanTitles(item),
      0.8,
    );
  }

  private async findAniListMetadata(
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
            coverImage {
              large
              medium
            }
            genres
            chapters
            description(asHtml: false)
            status
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

    return this.pickBestTitleMatch(
      title,
      candidates,
      (item) => this.extractAniListTitles(item),
      0.76,
    );
  }

  private async findMangaDexMetadata(
    title: string,
  ): Promise<MangaDexMetadata | null> {
    try {
      const normalizedTitle = title
        .replace(/\s*[-|]\s*(mangalivre|manga livre)\s*$/i, '')
        .replace(/\s*[-|]\s*cap[ií]tulo\s+\d+.*$/i, '')
        .replace(/\s+/g, ' ')
        .trim();
      if (!normalizedTitle) {
        return null;
      }

      const url =
        'https://api.mangadex.org/manga?' +
        `title=${encodeURIComponent(normalizedTitle)}` +
        '&limit=10' +
        '&includes[]=cover_art' +
        '&contentRating[]=safe' +
        '&contentRating[]=suggestive' +
        '&contentRating[]=erotica' +
        '&order[relevance]=desc';

      const payload = await this.externalApiHttpClient.fetchJsonWithRetry<{
        data?: Array<{
          id?: string;
          attributes?: {
            title?: Record<string, string | undefined>;
            altTitles?: Array<Record<string, string | undefined>>;
            description?: Record<string, string | undefined>;
            status?: string | null;
            lastChapter?: string | null;
          };
          relationships?: Array<{
            type?: string;
            attributes?: {
              fileName?: string | null;
            };
          }>;
        }>;
      }>(url, 'mangadex');

      const candidates = payload?.data ?? [];
      if (candidates.length === 0) {
        return null;
      }

      const best = this.pickBestTitleMatch(
        title,
        candidates,
        (item) => this.extractMangaDexTitles(item.attributes),
        0.5,
      );
      if (!best?.id) {
        return null;
      }

      const attrs = best.attributes;
      const titles = this.extractMangaDexTitles(attrs);
      const coverFileName = best.relationships?.find(
        (item) => item.type === 'cover_art' && item.attributes?.fileName,
      )?.attributes?.fileName;

      return {
        id: best.id,
        title: this.firstNonEmpty(
          attrs?.title?.en,
          ...Object.values(attrs?.title ?? {}),
        ),
        titles,
        coverImage: coverFileName
          ? `https://uploads.mangadex.org/covers/${best.id}/${coverFileName}`
          : null,
        description: this.cleanText(attrs?.description?.en),
        descriptionPt: this.cleanText(
          attrs?.description?.['pt-br'] ?? attrs?.description?.pt,
        ),
        publicationStatus: attrs?.status ?? null,
        lastChapter: attrs?.lastChapter ?? null,
      };
    } catch {
      return null;
    }
  }

  private async findMangaUpdatesTitles(title: string): Promise<string[]> {
    try {
      const response = await fetch(
        'https://api.mangaupdates.com/v1/series/search',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({ search: title }),
        },
      );

      if (!response.ok) {
        return [];
      }

      const payload = (await response.json()) as MangaUpdatesSearchResponse;
      const candidates = payload.results ?? [];
      const best = this.pickBestTitleMatch(
        title,
        candidates,
        (item) => [item.record?.title ?? '', item.hit_title ?? ''],
        0.5,
      );

      if (!best) {
        return [];
      }

      return this.uniqueTitles([best.record?.title, best.hit_title]);
    } catch {
      return [];
    }
  }

  private async canUseMalId(malId: number, mangaId: string): Promise<boolean> {
    const existing = await this.prisma.manga.findUnique({
      where: { malId },
      select: { id: true },
    });
    return !existing || existing.id === mangaId;
  }

  private async canUseAniListId(
    anilistId: number,
    mangaId: string,
  ): Promise<boolean> {
    const existing = await this.prisma.manga.findUnique({
      where: { anilistId },
      select: { id: true },
    });
    return !existing || existing.id === mangaId;
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
      Math.round(
        (item.updatedAt.getTime() - item.createdAt.getTime()) / 86_400_000,
      ),
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

  private firstNonEmpty(
    ...values: Array<string | null | undefined>
  ): string | null {
    for (const value of values) {
      const normalized = value?.trim();
      if (normalized) return normalized;
    }
    return null;
  }

  private resolvePositiveNumber(
    ...values: Array<number | null | undefined>
  ): number | null {
    for (const value of values) {
      if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
        return value;
      }
    }
    return null;
  }

  private uniqueTitles(values: Array<string | null | undefined>): string[] {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const value of values) {
      const title = value?.trim();
      if (!title) continue;
      const key = this.normalizeTitle(title);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      result.push(title);
    }
    return result;
  }

  private sameStringArray(left: string[], right: string[]): boolean {
    if (left.length !== right.length) return false;
    return left.every((value, index) => value === right[index]);
  }

  private cleanText(value: string | null | undefined): string | null {
    const normalized = value
      ?.replace(/\[([^\]]+)\]\(https?:\/\/[^)]+\)/g, '$1')
      .replace(/\r\n/g, '\n')
      .trim();
    return normalized || null;
  }

  private extractJikanTitles(item: JikanSearchItem): string[] {
    return this.uniqueTitles([
      item.title,
      item.title_english,
      item.title_japanese,
      ...(item.title_synonyms ?? []),
      ...(item.titles?.map((entry) => entry.title) ?? []),
    ]);
  }

  private extractAniListTitles(item: AniListSearchItem): string[] {
    return this.uniqueTitles([
      item.title?.english,
      item.title?.romaji,
      item.title?.native,
      ...(item.synonyms ?? []),
    ]);
  }

  private extractMangaDexTitles(
    attributes:
      | {
          title?: Record<string, string | undefined>;
          altTitles?: Array<Record<string, string | undefined>>;
        }
      | null
      | undefined,
  ): string[] {
    return this.uniqueTitles([
      ...Object.values(attributes?.title ?? {}),
      ...(attributes?.altTitles ?? []).flatMap((entry) => Object.values(entry)),
    ]);
  }

  private resolveEnglishTitle(
    anilist: AniListSearchItem | null,
    jikan: JikanSearchItem | null,
    mangaDex: MangaDexMetadata | null,
  ): string | null {
    const mangaDexEnglish = mangaDex?.titles.find((title) =>
      /^[\x00-\x7F]+$/.test(title),
    );
    return this.firstNonEmpty(
      anilist?.title?.english,
      anilist?.title?.romaji,
      jikan?.title_english,
      mangaDex?.title,
      mangaDexEnglish,
      jikan?.title,
    );
  }

  private resolveGenres(
    jikan: JikanSearchItem | null,
    anilist: AniListSearchItem | null,
  ): string[] {
    return this.uniqueTitles([
      ...(jikan?.genres?.map((genre) => genre.name) ?? []),
      ...(anilist?.genres ?? []),
    ]);
  }

  private mapAniListStatus(status: string | null | undefined): string | null {
    if (!status) return null;
    if (status === 'RELEASING') return 'Publishing';
    if (status === 'FINISHED') return 'Finished';
    if (status === 'HIATUS') return 'On Hiatus';
    if (status === 'CANCELLED') return 'Discontinued';
    return null;
  }

  private mapMangaDexStatus(status: string | null | undefined): string | null {
    if (!status) return null;
    if (status === 'ongoing') return 'Publishing';
    if (status === 'completed') return 'Finished';
    if (status === 'hiatus') return 'On Hiatus';
    if (status === 'cancelled') return 'Discontinued';
    return null;
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
      const titles = extractTitles(item).filter(
        (value) => value.trim().length > 0,
      );
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

    return (
      best.coverImage?.large?.trim() ?? best.coverImage?.medium?.trim() ?? null
    );
  }

  private async findMangaDexCover(title: string): Promise<string | null> {
    try {
      const manga = await this.mangaDexService.searchMangaByTitle(title);
      if (!manga) {
        return null;
      }
      return (
        (await this.mangaDexService.getCoverImageUrl(manga.id))?.trim() ?? null
      );
    } catch {
      return null;
    }
  }

  private async resolveBestCoverForManga(manga: {
    id: string;
    title: string;
    coverImage: string | null;
  }): Promise<CoverRepairResult> {
    const [aniListResult, jikanResult, mangaDexResult] =
      await Promise.allSettled([
        this.findAniListCover(manga.title),
        this.findJikanCover(manga.title),
        this.findMangaDexCover(manga.title),
      ]);

    const aniListCover =
      aniListResult.status === 'fulfilled' ? aniListResult.value : null;
    const jikanCover =
      jikanResult.status === 'fulfilled' ? jikanResult.value : null;
    const mangaDexCover =
      mangaDexResult.status === 'fulfilled' ? mangaDexResult.value : null;

    const normalizedCurrent = this.normalizeCoverUrl(manga.coverImage);
    const normalizedAniList = this.normalizeCoverUrl(aniListCover);
    const normalizedJikan = this.normalizeCoverUrl(jikanCover);
    const normalizedMangaDex = this.normalizeCoverUrl(mangaDexCover);

    const nextCover =
      normalizedAniList ??
      normalizedJikan ??
      normalizedMangaDex ??
      normalizedCurrent;

    const source: CoverRepairResult['source'] = normalizedAniList
      ? 'anilist'
      : normalizedJikan
        ? 'jikan'
        : normalizedMangaDex
          ? 'mangadex'
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
}
