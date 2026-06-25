import { apiRequest } from "@/lib/api-client";

export type MangaDuplicateItem = {
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

export type MangaDuplicateGroup = {
  normalizedTitle: string;
  canonicalMangaId: string;
  canonicalTitle: string;
  totalItems: number;
  totalReferences: number;
  items: MangaDuplicateItem[];
};

export type MangaDuplicateGroupsResponse = {
  totalGroups: number;
  groups: MangaDuplicateGroup[];
};

export type MangaMissingCoversResponse = {
  total: number;
  items: MangaDuplicateItem[];
};

export type MangaDuplicateMergeResponse = {
  canonicalMangaId: string;
  canonicalTitle: string;
  processedDuplicates: number;
  movedUserEntries: number;
  mergedUserEntries: number;
  movedExternalMaps: number;
  deletedMangas: number;
  skippedMangas: number;
};

export type MangaRepairCoverResponse = {
  mangaId: string;
  title: string;
  previousCoverImage: string | null;
  coverImage: string | null;
  changed: boolean;
  source: "anilist" | "jikan" | "mangadex" | "manual" | "unchanged";
};

export type MangaRepairMissingCoversResponse = {
  total: number;
  updated: number;
  unresolved: number;
  apply: boolean;
  results: MangaRepairCoverResponse[];
};

export async function listDuplicateMangaGroups(limit = 30) {
  const safeLimit = Math.max(1, Math.min(limit, 100));
  return apiRequest<MangaDuplicateGroupsResponse>(
    `/manga/admin/duplicates?limit=${safeLimit}`,
  );
}

export async function listMissingMangaCovers(limit = 50) {
  const safeLimit = Math.max(1, Math.min(limit, 200));
  return apiRequest<MangaMissingCoversResponse>(
    `/manga/admin/covers/missing?limit=${safeLimit}`,
  );
}

export async function mergeDuplicateMangaGroup(input: {
  canonicalMangaId: string;
  duplicateMangaIds: string[];
}) {
  return apiRequest<MangaDuplicateMergeResponse>("/manga/admin/duplicates/merge", {
    method: "POST",
    csrf: "authenticated-required",
    body: input,
  });
}

export async function repairMangaCover(mangaId: string) {
  return apiRequest<MangaRepairCoverResponse>(
    `/manga/admin/${encodeURIComponent(mangaId)}/repair-cover`,
    {
      method: "POST",
      csrf: "authenticated-required",
    },
  );
}

export async function updateMangaCoverManually(
  mangaId: string,
  coverImage: string,
) {
  return apiRequest<MangaRepairCoverResponse>(
    `/manga/admin/${encodeURIComponent(mangaId)}/cover`,
    {
      method: "PATCH",
      csrf: "authenticated-required",
      body: { coverImage },
    },
  );
}

export async function repairMissingMangaCovers(limit = 50) {
  const safeLimit = Math.max(1, Math.min(limit, 25));
  return apiRequest<MangaRepairMissingCoversResponse>(
    `/manga/admin/covers/missing/repair?limit=${safeLimit}`,
    {
      method: "POST",
      csrf: "authenticated-required",
    },
  );
}
