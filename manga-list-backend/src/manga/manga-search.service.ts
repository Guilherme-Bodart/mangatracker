import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import { ExternalApiHttpClient } from '../common/http/external-api-client';
import { JikanMangaSearchResult, JikanSearchResponse } from './dto/manga.dto';

@Injectable()
export class MangaSearchService {
  private readonly JIKAN_BASE_URL = 'https://api.jikan.moe/v4';

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
  ): Promise<JikanSearchResponse> {
    const cacheKey = `search:${query}:${page}:${genres}:${genresMode}:${type}:${allowNsfw}`;
    const selectedGenreIds = this.parseGenreIds(genres);
    const cachedResult =
      await this.cacheManager.get<JikanSearchResponse>(cacheKey);

    if (cachedResult) {
      return cachedResult;
    }

    try {
      let url = `${this.JIKAN_BASE_URL}/manga?page=${page}&limit=20&order_by=members&sort=desc`;
      if (!allowNsfw) {
        url += '&sfw=true';
      }

      if (query) {
        url += `&q=${encodeURIComponent(query)}`;
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
}
