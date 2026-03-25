import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import { ExternalApiHttpClient } from '../common/http/external-api-client';
import { JikanMangaSearchResult, JikanSearchResponse } from './dto/manga.dto';
import { MangaSearchProvider } from './dto/search-manga-query.dto';

type AniListMedia = {
  id: number;
  idMal: number | null;
  title?: {
    romaji?: string | null;
    english?: string | null;
    native?: string | null;
  } | null;
  coverImage?: {
    large?: string | null;
    medium?: string | null;
  } | null;
  genres?: string[] | null;
  averageScore?: number | null;
  chapters?: number | null;
  description?: string | null;
  status?: string | null;
};

type AniListSearchResponse = {
  data?: {
    Page?: {
      pageInfo?: {
        currentPage: number;
        hasNextPage: boolean;
        lastPage: number;
      };
      media?: AniListMedia[];
    };
  };
};

@Injectable()
export class MangaSearchService {
  private readonly JIKAN_BASE_URL = 'https://api.jikan.moe/v4';
  private readonly ANILIST_GRAPHQL_URL = 'https://graphql.anilist.co';
  private readonly MAL_TO_ANILIST_GENRE: Record<number, string> = {
    1: 'Action',
    2: 'Adventure',
    4: 'Comedy',
    8: 'Drama',
    10: 'Fantasy',
    14: 'Horror',
    22: 'Romance',
    24: 'Sci-Fi',
    36: 'Slice of Life',
    37: 'Supernatural',
  };

  constructor(
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
    private readonly externalApiClient: ExternalApiHttpClient,
  ) {}

  async searchManga(
    query: string,
    page: number = 1,
    genres?: string,
    genresMode: 'AND' | 'OR' = 'OR',
    type?: string,
    allowNsfw: boolean = false,
    provider: MangaSearchProvider = MangaSearchProvider.JIKAN,
  ): Promise<JikanSearchResponse> {
    const cacheKey = `search:${provider}:${query}:${page}:${genres}:${genresMode}:${type}:${allowNsfw}`;
    const selectedGenreIds = this.parseGenreIds(genres);
    const cachedResult =
      await this.cacheManager.get<JikanSearchResponse>(cacheKey);

    if (cachedResult) {
      return cachedResult;
    }

    if (provider === MangaSearchProvider.ANILIST) {
      const result = await this.searchAniListManga(
        query,
        page,
        type,
        selectedGenreIds,
        genresMode,
        allowNsfw,
      );
      await this.cacheManager.set(cacheKey, result, 60 * 60 * 24 * 1000);
      return result;
    }

    try {
      const normalizedQuery = query?.trim();
      let url = `${this.JIKAN_BASE_URL}/manga?page=${page}&limit=20`;
      if (!normalizedQuery) {
        // For empty queries, keep popular ordering.
        url += '&order_by=members&sort=desc';
      }
      if (!allowNsfw) {
        url += '&sfw=true';
      }

      if (normalizedQuery) {
        // When searching by text, let Jikan relevance rank the results.
        url += `&q=${encodeURIComponent(normalizedQuery)}`;
      }

      if (type) {
        url += `&type=${type}`;
      }

      if (selectedGenreIds.length > 0) {
        url += `&genres=${selectedGenreIds.join(',')}`;
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
      const filteredData =
        selectedGenreIds.length > 0
          ? this.filterBySelectedGenres(data.data, selectedGenreIds, genresMode)
          : data.data;
      const normalizedData: JikanSearchResponse = {
        ...data,
        data: filteredData,
      };

      await this.cacheManager.set(
        cacheKey,
        normalizedData,
        60 * 60 * 24 * 1000,
      );

      return normalizedData;
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        'Internal server error during search',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

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
      let url = `${this.JIKAN_BASE_URL}/top/manga?page=${page}&limit=20`;
      if (!allowNsfw) {
        url += '&sfw=true';
      }

      const response = await this.fetchWithRetry(url);

      if (!response.ok) {
        throw new HttpException(
          'Failed to fetch top manga',
          HttpStatus.BAD_GATEWAY,
        );
      }

      const data = (await response.json()) as JikanSearchResponse;
      await this.cacheManager.set(cacheKey, data, 60 * 60 * 24 * 1000);
      return data;
    } catch {
      throw new HttpException(
        'Could not connect to MyAnimeList API',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  private parseGenreIds(genres?: string): number[] {
    if (!genres) {
      return [];
    }

    const values = genres
      .split(',')
      .map((entry) => Number.parseInt(entry.trim(), 10))
      .filter((entry) => Number.isFinite(entry) && entry > 0);

    return Array.from(new Set(values));
  }

  private filterBySelectedGenres(
    mangas: JikanMangaSearchResult[],
    selectedGenreIds: number[],
    mode: 'AND' | 'OR',
  ): JikanMangaSearchResult[] {
    if (selectedGenreIds.length === 0) {
      return mangas;
    }

    return mangas.filter((manga) => {
      const ids = this.collectTaxonomyIds(manga);
      if (ids.size === 0) {
        return false;
      }

      if (mode === 'AND') {
        return selectedGenreIds.every((genreId) => ids.has(genreId));
      }

      return selectedGenreIds.some((genreId) => ids.has(genreId));
    });
  }

  private collectTaxonomyIds(manga: JikanMangaSearchResult): Set<number> {
    const ids = new Set<number>();
    const groups = [
      ...(manga.genres ?? []),
      ...(manga.explicit_genres ?? []),
      ...(manga.themes ?? []),
      ...(manga.demographics ?? []),
    ];

    for (const group of groups) {
      if (
        typeof group.mal_id === 'number' &&
        Number.isFinite(group.mal_id) &&
        group.mal_id > 0
      ) {
        ids.add(group.mal_id);
      }
    }

    return ids;
  }

  private async fetchWithRetry(url: string): Promise<Response> {
    return this.externalApiClient.fetchWithRetry(url, 'jikan');
  }

  private async searchAniListManga(
    query: string,
    page: number,
    type?: string,
    selectedGenreIds: number[] = [],
    genresMode: 'AND' | 'OR' = 'OR',
    allowNsfw: boolean = false,
  ): Promise<JikanSearchResponse> {
    const typeFilter = this.mapAniListTypeFilter(type);
    const selectedAniListGenres = selectedGenreIds
      .map((id) => this.MAL_TO_ANILIST_GENRE[id])
      .filter((genre): genre is string => !!genre);
    const graphqlQuery = `
      query (
        $page: Int!,
        $perPage: Int!,
        $search: String,
        $format: MediaFormat,
        $countryOfOrigin: CountryCode,
        $genreIn: [String],
        $isAdult: Boolean
      ) {
        Page(page: $page, perPage: $perPage) {
          pageInfo {
            currentPage
            hasNextPage
            lastPage
          }
          media(
            type: MANGA
            search: $search
            format: $format
            countryOfOrigin: $countryOfOrigin
            genre_in: $genreIn
            isAdult: $isAdult
            sort: POPULARITY_DESC
          ) {
            id
            idMal
            title {
              romaji
              english
              native
            }
            coverImage {
              large
              medium
            }
            genres
            averageScore
            chapters
            description(asHtml: false)
            status
          }
        }
      }
    `;

    const payload = {
      query: graphqlQuery,
      variables: {
        page,
        perPage: 20,
        search: query?.trim() || undefined,
        format: typeFilter.format,
        countryOfOrigin: typeFilter.countryOfOrigin,
        genreIn:
          selectedAniListGenres.length > 0 ? selectedAniListGenres : undefined,
        isAdult: allowNsfw ? undefined : false,
      },
    };

    const response = await fetch(this.ANILIST_GRAPHQL_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new HttpException(
        'Failed to search manga',
        HttpStatus.BAD_GATEWAY,
      );
    }

    const data = (await response.json()) as AniListSearchResponse;
    const media = data.data?.Page?.media ?? [];
    const pageInfo = data.data?.Page?.pageInfo;

    let mappedData: JikanMangaSearchResult[] = media.map((item) => {
      const title =
        item.title?.english?.trim() ||
        item.title?.romaji?.trim() ||
        item.title?.native?.trim() ||
        'Unknown title';
      const titleEnglish =
        item.title?.english?.trim() || item.title?.romaji?.trim() || undefined;
      const coverImage =
        item.coverImage?.large?.trim() ||
        item.coverImage?.medium?.trim() ||
        '';

      return {
        mal_id: item.idMal ?? -item.id,
        anilist_id: item.id,
        provider: 'anilist',
        title,
        title_english: titleEnglish,
        images: {
          jpg: {
            image_url: coverImage,
            large_image_url: coverImage,
          },
        },
        genres: (item.genres ?? []).map((genreName, index) => ({
          mal_id: index + 1,
          name: genreName,
        })),
        chapters: item.chapters ?? undefined,
        synopsis: item.description ?? undefined,
        score:
          typeof item.averageScore === 'number'
            ? Number((item.averageScore / 10).toFixed(2))
            : undefined,
      };
    });

    if (selectedAniListGenres.length > 0 && genresMode === 'AND') {
      mappedData = mappedData.filter((item) => {
        const names = new Set((item.genres ?? []).map((genre) => genre.name));
        return selectedAniListGenres.every((genreName) => names.has(genreName));
      });
    }

    return {
      data: mappedData,
      pagination: {
        has_next_page: pageInfo?.hasNextPage ?? false,
        current_page: pageInfo?.currentPage ?? page,
        last_visible_page: pageInfo?.lastPage ?? page,
      },
    };
  }

  private mapAniListTypeFilter(type?: string): {
    format?: 'MANGA' | 'NOVEL' | 'ONE_SHOT';
    countryOfOrigin?: 'JP' | 'KR' | 'CN';
  } {
    const normalized = type?.trim().toLowerCase();
    if (!normalized || normalized === 'all') {
      return {};
    }

    if (normalized === 'novel') {
      return { format: 'NOVEL' };
    }
    if (normalized === 'oneshot') {
      return { format: 'ONE_SHOT' };
    }
    if (normalized === 'manga') {
      return { countryOfOrigin: 'JP' };
    }
    if (normalized === 'manhwa') {
      return { countryOfOrigin: 'KR' };
    }
    if (normalized === 'manhua') {
      return { countryOfOrigin: 'CN' };
    }

    return {};
  }
}
