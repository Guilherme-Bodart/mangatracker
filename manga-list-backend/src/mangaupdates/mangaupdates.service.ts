import { Injectable, Logger } from '@nestjs/common';
import { ExternalApiHttpClient } from '../common/http/external-api-client';
import { LatestChapterDto } from '../manga/manga-chapters.service';

type MangaUpdatesSearchResponse = {
  results?: Array<{
    record?: {
      series_id?: number;
      title?: string;
    };
    hit_title?: string;
  }>;
};

type MangaUpdatesSeriesResponse = {
  latest_chapter?: number | string | null;
  last_updated?: {
    as_rfc3339?: string | null;
  } | null;
};

@Injectable()
export class MangaUpdatesService {
  private readonly logger = new Logger(MangaUpdatesService.name);
  private readonly baseUrl = 'https://api.mangaupdates.com/v1';

  constructor(private readonly externalApiClient: ExternalApiHttpClient) {}

  async getLatestChaptersByTitle(title: string): Promise<LatestChapterDto[]> {
    const seriesId = await this.searchBestSeriesId(title);
    if (!seriesId) {
      return [];
    }

    const details = await this.externalApiClient.fetchJsonWithRetry<MangaUpdatesSeriesResponse>(
      `${this.baseUrl}/series/${seriesId}`,
      'mangaupdates',
    );

    const latestChapter = details?.latest_chapter;
    if (latestChapter === undefined || latestChapter === null) {
      return [];
    }

    return [
      {
        chapter: String(latestChapter),
        title: null,
        publishedAt: details?.last_updated?.as_rfc3339 ?? null,
      },
    ];
  }

  private async searchBestSeriesId(title: string): Promise<number | null> {
    const normalizedQuery = this.normalizeTitle(title);
    if (!normalizedQuery) {
      return null;
    }

    try {
      const response = await fetch(`${this.baseUrl}/series/search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ search: title }),
      });

      if (!response.ok) {
        return null;
      }

      const payload = (await response.json()) as MangaUpdatesSearchResponse;
      const candidates = payload.results ?? [];
      if (candidates.length === 0) {
        return null;
      }

      let best: { id: number; score: number } | null = null;

      for (const candidate of candidates) {
        const id = candidate.record?.series_id;
        if (!id) continue;

        const labels = [
          candidate.record?.title,
          candidate.hit_title,
        ].filter((value): value is string => !!value);

        const score = this.computeBestTitleScore(normalizedQuery, labels);
        if (!best || score > best.score) {
          best = { id, score };
        }
      }

      if (!best || best.score < 0.55) {
        return null;
      }

      return best.id;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'unknown error';
      this.logger.warn(`Failed MangaUpdates search for "${title}": ${message}`);
      return null;
    }
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
