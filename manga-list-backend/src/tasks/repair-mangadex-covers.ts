import * as fs from 'node:fs';
import * as path from 'node:path';
import * as dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';

type ScriptOptions = {
  apply: boolean;
  limit: number;
  includeNull: boolean;
};

type JikanMangaDetailsResponse = {
  data?: {
    images?: {
      jpg?: {
        large_image_url?: string | null;
        image_url?: string | null;
      } | null;
    } | null;
  } | null;
};

type JikanSearchResponse = {
  data?: Array<{
    title?: string | null;
    title_english?: string | null;
    title_japanese?: string | null;
    title_synonyms?: string[] | null;
    images?: {
      jpg?: {
        large_image_url?: string | null;
        image_url?: string | null;
      } | null;
    } | null;
  }>;
};

type AniListByIdResponse = {
  data?: {
    Media?: {
      coverImage?: {
        large?: string | null;
        medium?: string | null;
      } | null;
    } | null;
  };
};

type AniListSearchResponse = {
  data?: {
    Page?: {
      media?: Array<{
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
      }>;
    };
  };
};

const JIKAN_BASE_URL = 'https://api.jikan.moe/v4';
const ANILIST_GRAPHQL_URL = 'https://graphql.anilist.co';

function loadEnvFiles() {
  const root = process.cwd();
  const candidates = ['.env', '.env.local', '.env.production'];
  for (const fileName of candidates) {
    const filePath = path.join(root, fileName);
    if (fs.existsSync(filePath)) {
      dotenv.config({ path: filePath, override: false });
    }
  }
}

function parseArgs(argv: string[]): ScriptOptions {
  const options: ScriptOptions = {
    apply: false,
    limit: 500,
    includeNull: false,
  };

  for (const arg of argv) {
    if (arg === '--apply') {
      options.apply = true;
      continue;
    }
    if (arg === '--include-null') {
      options.includeNull = true;
      continue;
    }
    if (arg.startsWith('--limit=')) {
      const raw = Number.parseInt(arg.slice('--limit='.length), 10);
      if (Number.isFinite(raw) && raw > 0) {
        options.limit = raw;
      }
    }
  }

  return options;
}

function normalizeTitle(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function computeTokenJaccard(left: string, right: string): number {
  const leftTokens = new Set(left.split(' ').filter(Boolean));
  const rightTokens = new Set(right.split(' ').filter(Boolean));
  if (!leftTokens.size || !rightTokens.size) return 0;

  let intersection = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) {
      intersection++;
    }
  }

  const union = new Set([...leftTokens, ...rightTokens]).size;
  return union === 0 ? 0 : intersection / union;
}

function computeBestTitleScore(query: string, candidates: string[]): number {
  let best = 0;
  for (const candidateRaw of candidates) {
    const candidate = normalizeTitle(candidateRaw);
    if (!candidate) continue;
    if (candidate === query) return 1;
    if (candidate.includes(query) || query.includes(candidate)) {
      best = Math.max(best, 0.85);
    }
    best = Math.max(best, computeTokenJaccard(query, candidate));
  }
  return best;
}

function normalizeCoverUrl(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  if (!normalized) return null;
  try {
    const parsed = new URL(normalized);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

function isBlockedMangaDexCover(url: string | null | undefined): boolean {
  const normalized = normalizeCoverUrl(url);
  if (!normalized) return false;
  try {
    const host = new URL(normalized).hostname.toLowerCase();
    return host === 'uploads.mangadex.org' || host.endsWith('.mangadex.org');
  } catch {
    return false;
  }
}

async function fetchJson<T>(
  url: string,
  init?: RequestInit,
  timeoutMs: number = 12000,
): Promise<T | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
    });
    if (!response.ok) {
      return null;
    }
    return (await response.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchJikanCoverByMalId(malId: number): Promise<string | null> {
  if (!Number.isFinite(malId) || malId <= 0) return null;
  const payload = await fetchJson<JikanMangaDetailsResponse>(
    `${JIKAN_BASE_URL}/manga/${malId}`,
  );
  const candidate =
    payload?.data?.images?.jpg?.large_image_url ??
    payload?.data?.images?.jpg?.image_url ??
    null;
  const normalized = normalizeCoverUrl(candidate);
  if (!normalized || isBlockedMangaDexCover(normalized)) {
    return null;
  }
  return normalized;
}

async function fetchJikanCoverByTitle(title: string): Promise<string | null> {
  const query = title.trim();
  if (!query) return null;

  const payload = await fetchJson<JikanSearchResponse>(
    `${JIKAN_BASE_URL}/manga?q=${encodeURIComponent(query)}&limit=10`,
  );
  const candidates = payload?.data ?? [];
  if (!candidates.length) return null;

  const normalizedQuery = normalizeTitle(query);
  let best:
    | {
        score: number;
        cover: string | null;
      }
    | null = null;

  for (const item of candidates) {
    const titles = [
      item.title,
      item.title_english,
      item.title_japanese,
      ...(item.title_synonyms ?? []),
    ]
      .map((entry) => (entry ?? '').trim())
      .filter((entry) => entry.length > 0);

    const score = computeBestTitleScore(normalizedQuery, titles);
    const cover = normalizeCoverUrl(
      item.images?.jpg?.large_image_url ?? item.images?.jpg?.image_url ?? null,
    );

    if (!best || score > best.score) {
      best = { score, cover };
    }
  }

  if (!best || best.score < 0.85) return null;
  if (!best.cover || isBlockedMangaDexCover(best.cover)) return null;
  return best.cover;
}

async function fetchAniListCoverById(
  anilistId: number | null,
): Promise<string | null> {
  if (!anilistId || !Number.isFinite(anilistId) || anilistId <= 0) {
    return null;
  }

  const query = `
    query ($id: Int!) {
      Media(id: $id, type: MANGA) {
        coverImage {
          large
          medium
        }
      }
    }
  `;

  const payload = await fetchJson<AniListByIdResponse>(ANILIST_GRAPHQL_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      query,
      variables: { id: anilistId },
    }),
  });

  const cover = normalizeCoverUrl(
    payload?.data?.Media?.coverImage?.large ??
      payload?.data?.Media?.coverImage?.medium ??
      null,
  );
  if (!cover || isBlockedMangaDexCover(cover)) return null;
  return cover;
}

async function fetchAniListCoverByTitle(title: string): Promise<string | null> {
  const queryText = title.trim();
  if (!queryText) return null;

  const query = `
    query ($search: String!, $perPage: Int!) {
      Page(page: 1, perPage: $perPage) {
        media(search: $search, type: MANGA, sort: SEARCH_MATCH) {
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

  const payload = await fetchJson<AniListSearchResponse>(ANILIST_GRAPHQL_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      query,
      variables: {
        search: queryText,
        perPage: 10,
      },
    }),
  });

  const candidates = payload?.data?.Page?.media ?? [];
  if (!candidates.length) return null;

  const normalizedQuery = normalizeTitle(queryText);
  let best:
    | {
        score: number;
        cover: string | null;
      }
    | null = null;

  for (const item of candidates) {
    const titles = [
      item.title?.english,
      item.title?.romaji,
      item.title?.native,
      ...(item.synonyms ?? []),
    ]
      .map((entry) => (entry ?? '').trim())
      .filter((entry) => entry.length > 0);

    const score = computeBestTitleScore(normalizedQuery, titles);
    const cover = normalizeCoverUrl(
      item.coverImage?.large ?? item.coverImage?.medium ?? null,
    );

    if (!best || score > best.score) {
      best = { score, cover };
    }
  }

  if (!best || best.score < 0.85) return null;
  if (!best.cover || isBlockedMangaDexCover(best.cover)) return null;
  return best.cover;
}

async function resolveBestCover(
  malId: number,
  anilistId: number | null,
  title: string,
): Promise<string | null> {
  const byMalId = await fetchJikanCoverByMalId(malId);
  if (byMalId) return byMalId;

  const byAniListId = await fetchAniListCoverById(anilistId);
  if (byAniListId) return byAniListId;

  const byTitleJikan = await fetchJikanCoverByTitle(title);
  if (byTitleJikan) return byTitleJikan;

  const byTitleAniList = await fetchAniListCoverByTitle(title);
  if (byTitleAniList) return byTitleAniList;

  return null;
}

async function main() {
  loadEnvFiles();
  const options = parseArgs(process.argv.slice(2));

  const prisma = new PrismaClient();
  try {
    const targets = await prisma.manga.findMany({
      where: {
        OR: [
          { coverImage: { contains: 'mangadex.org' } },
          ...(options.includeNull ? [{ coverImage: null }] : []),
        ],
      },
      select: {
        id: true,
        malId: true,
        anilistId: true,
        title: true,
        coverImage: true,
      },
      orderBy: [{ updatedAt: 'desc' }],
      take: options.limit,
    });

    console.log(
      `[repair-mangadex-covers] mode=${options.apply ? 'apply' : 'dry-run'} includeNull=${options.includeNull} limit=${options.limit} targets=${targets.length}`,
    );

    let updated = 0;
    let unresolved = 0;

    for (const manga of targets) {
      const currentIsBlocked = isBlockedMangaDexCover(manga.coverImage);
      if (!currentIsBlocked && manga.coverImage && !options.includeNull) {
        continue;
      }

      const newCover = await resolveBestCover(
        manga.malId,
        manga.anilistId,
        manga.title,
      );

      if (!newCover) {
        unresolved++;
        console.log(
          `- [unresolved] ${manga.id} malId=${manga.malId} anilistId=${manga.anilistId ?? 'null'} title="${manga.title}"`,
        );

        if (options.apply) {
          await prisma.manga.update({
            where: { id: manga.id },
            data: {
              coverImage: null,
              lastCheckedAt: null,
            },
          });
        }
        continue;
      }

      updated++;
      console.log(
        `- [updated] ${manga.id} "${manga.title}" -> ${newCover}`,
      );

      if (options.apply) {
        await prisma.manga.update({
          where: { id: manga.id },
          data: {
            coverImage: newCover,
            lastCheckedAt: null,
          },
        });
      }
    }

    console.log(
      `[repair-mangadex-covers] done updated=${updated} unresolved=${unresolved} apply=${options.apply}`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

void main();
