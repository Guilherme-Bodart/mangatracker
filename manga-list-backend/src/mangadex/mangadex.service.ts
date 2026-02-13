import { Injectable, Logger } from '@nestjs/common';

type MangaDexSearchResult = {
  id: string;
  attributes: {
    status?: string | null;
    lastChapter?: string | null;
  };
};

type MangaDexChapterResult = {
  chapter: string;
  title: string | null;
  publishedAt: string | null;
};

@Injectable()
export class MangaDexService {
  private readonly logger = new Logger(MangaDexService.name);
  private readonly BASE_URL = 'https://api.mangadex.org';
  private readonly externalApiTimeoutMs = this.parseEnvInt(
    process.env.EXTERNAL_API_TIMEOUT_MS,
    10000,
  );
  private readonly externalApiRetries = this.parseEnvInt(
    process.env.EXTERNAL_API_RETRIES,
    2,
  );

  async searchMangaByTitle(
    title: string,
  ): Promise<MangaDexSearchResult | null> {
    try {
      // Clean title for search (remove special chars potentially)
      const cleanTitle = encodeURIComponent(title);

      const searchUrl = `${this.BASE_URL}/manga?title=${cleanTitle}&limit=5&contentRating[]=safe&contentRating[]=suggestive&contentRating[]=erotica&order[relevance]=desc`;

      const data = await this.fetchJsonWithRetry<{
        data?: Array<MangaDexSearchResult>;
      }>(searchUrl);
      if (!data?.data || data.data.length === 0) return null;

      // Return the first match ID and attributes
      return {
        id: data.data[0].id,
        attributes: data.data[0].attributes,
      };
    } catch (error: unknown) {
      this.logger.error(
        `Failed to fetch from MangaDex: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      return null;
    }
  }

  async getDescriptions(mangaDexId: string) {
    try {
      const data = await this.fetchJsonWithRetry<{
        data?: {
          attributes?: {
            description?: Record<string, string>;
          };
        };
      }>(`${this.BASE_URL}/manga/${mangaDexId}`);

      const descriptions = data?.data?.attributes?.description;
      if (!descriptions) return { en: null, pt: null };

      return {
        en: this.cleanDescription(descriptions.en || null),
        pt: this.cleanDescription(
          descriptions['pt-br'] || descriptions.pt || null,
        ),
      };
    } catch (error: unknown) {
      this.logger.error(
        `Failed to fetch descriptions: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      return { en: null, pt: null };
    }
  }

  async getLatestChapters(
    mangaDexId: string,
    limit: number = 2,
  ): Promise<MangaDexChapterResult[]> {
    try {
      const safeLimit = Math.max(1, Math.min(limit, 10));
      const url =
        `${this.BASE_URL}/chapter?manga=${encodeURIComponent(mangaDexId)}` +
        '&translatedLanguage[]=en' +
        '&limit=100' +
        '&order[chapter]=desc';

      const payload = await this.fetchJsonWithRetry<{
        data?: Array<{
          attributes?: {
            chapter?: string | null;
            title?: string | null;
            readableAt?: string | null;
            publishAt?: string | null;
            createdAt?: string | null;
          };
        }>;
      }>(url);

      if (!payload?.data?.length) return [];

      const uniqueByChapter = new Map<string, MangaDexChapterResult>();

      for (const item of payload.data) {
        const attrs = item.attributes;
        const rawChapter = attrs?.chapter?.trim();
        if (!rawChapter) continue;
        if (uniqueByChapter.has(rawChapter)) continue;

        uniqueByChapter.set(rawChapter, {
          chapter: rawChapter,
          title: attrs?.title?.trim() || null,
          publishedAt:
            attrs?.readableAt || attrs?.publishAt || attrs?.createdAt || null,
        });

        if (uniqueByChapter.size >= safeLimit) break;
      }

      return Array.from(uniqueByChapter.values());
    } catch (error: unknown) {
      this.logger.warn(
        `Failed to fetch latest chapters for ${mangaDexId}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      return [];
    }
  }

  private cleanDescription(text: string | null): string | null {
    if (!text) return null;

    // 1. Remove Markdown links [Label](URL) -> completely remove if it seems like a list of links
    // Or just keep the label? Usually these are "Read here", "Original Webtoon", etc.
    // The user example shows "[1st Trailer](...)"
    // Let's remove any pattern like [Text](http...) specific citations usually at the end.

    let cleaned = text;

    // Remove "---" and everything after it (often used for credits/links footer)
    const separatorRegex = /\n\s*-{3,}\s*\n/i;
    const parts = cleaned.split(separatorRegex);
    if (parts.length > 1) {
      // Usually the main description is the first part
      cleaned = parts[0];
    }

    // Remove lines that look like links/credits starting with [
    // format: [Label](url) or [Label] (url)
    cleaned = cleaned.replace(/\[.*?\]\(http.*?\)/g, '');

    // Remove lines specifically about "Official Translation", "Links", "Original Webtoon"
    cleaned = cleaned.replace(
      /(Original Webtoon|Official .*? Translation|Links):?.*/gi,
      '',
    );

    // Trim whitespace
    return cleaned.trim();
  }

  private parseEnvInt(value: string | undefined, fallback: number): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }

  private async sleep(ms: number) {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  private getRetryDelayMs(attempt: number): number {
    return Math.min(250 * 2 ** attempt, 2000);
  }

  private async fetchJsonWithRetry<T>(url: string): Promise<T | null> {
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

        if (!response.ok) {
          return null;
        }

        const payload = (await response.json()) as T;
        return payload;
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
}
