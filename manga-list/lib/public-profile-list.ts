import type { MangaListItem } from "@/lib/public-profile-types";

export type PublicProfileSortBy = "name" | "type" | "rating";
export type PublicProfileSortDirection = "asc" | "desc";

export const PUBLIC_PROFILE_PAGE_SIZE_OPTIONS = [40, 80, 120] as const;
export const PUBLIC_PROFILE_DEFAULT_PAGE_SIZE = 40;
export const PUBLIC_PROFILE_SEARCH_DEBOUNCE_MS = 700;

function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLowerCase();
}

function compareTextAsc(left: string, right: string): number {
  return left.localeCompare(right, undefined, { sensitivity: "base" });
}

function getTitle(item: MangaListItem): string {
  return item.manga.title ?? "";
}

function getPrimaryType(item: MangaListItem): string {
  const genres = Array.isArray(item.manga.genres) ? item.manga.genres : [];
  if (genres.length === 0) {
    return "";
  }

  return (
    genres.find((genre) => String(genre || "").trim().length > 0)?.trim() ?? ""
  );
}

function compareWithDirection(
  left: number,
  right: number,
  direction: PublicProfileSortDirection,
): number {
  if (left === right) {
    return 0;
  }

  if (direction === "asc") {
    return left < right ? -1 : 1;
  }

  return left > right ? -1 : 1;
}

function compareNullableRating(
  left: number | null,
  right: number | null,
  direction: PublicProfileSortDirection,
): number {
  if (left == null && right == null) {
    return 0;
  }

  if (left == null) {
    return 1;
  }

  if (right == null) {
    return -1;
  }

  return compareWithDirection(left, right, direction);
}

export function filterPublicProfileManga(
  mangaList: MangaListItem[],
  rawQuery: string,
): MangaListItem[] {
  const query = normalizeText(rawQuery || "");
  if (!query) {
    return mangaList;
  }

  return mangaList.filter((item) =>
    normalizeText(getTitle(item)).includes(query),
  );
}

export function sortPublicProfileManga(
  mangaList: MangaListItem[],
  sortBy: PublicProfileSortBy,
  direction: PublicProfileSortDirection,
): MangaListItem[] {
  const sorted = [...mangaList];

  sorted.sort((left, right) => {
    if (left.isFavorite !== right.isFavorite) {
      return left.isFavorite ? -1 : 1;
    }

    if (sortBy === "name") {
      const byName =
        compareTextAsc(getTitle(left), getTitle(right)) *
        (direction === "asc" ? 1 : -1);
      if (byName !== 0) {
        return byName;
      }
      return 0;
    }

    if (sortBy === "type") {
      const typeCompare =
        compareTextAsc(getPrimaryType(left), getPrimaryType(right)) *
        (direction === "asc" ? 1 : -1);
      if (typeCompare !== 0) {
        return typeCompare;
      }

      return compareTextAsc(getTitle(left), getTitle(right));
    }

    const ratingCompare = compareNullableRating(
      left.rating,
      right.rating,
      direction,
    );
    if (ratingCompare !== 0) {
      return ratingCompare;
    }

    return compareTextAsc(getTitle(left), getTitle(right));
  });

  return sorted;
}

export function paginatePublicProfileManga(
  mangaList: MangaListItem[],
  page: number,
  pageSize: number,
) {
  const safePageSize = PUBLIC_PROFILE_PAGE_SIZE_OPTIONS.includes(
    pageSize as (typeof PUBLIC_PROFILE_PAGE_SIZE_OPTIONS)[number],
  )
    ? pageSize
    : PUBLIC_PROFILE_DEFAULT_PAGE_SIZE;

  const totalItems = mangaList.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / safePageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * safePageSize;
  const end = start + safePageSize;

  return {
    page: safePage,
    pageSize: safePageSize,
    totalItems,
    totalPages,
    items: mangaList.slice(start, end),
  };
}
