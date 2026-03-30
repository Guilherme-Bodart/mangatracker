import { describe, expect, it } from "vitest";
import type { MangaListItem } from "@/lib/public-profile-types";
import {
  filterPublicProfileManga,
  paginatePublicProfileManga,
  sortPublicProfileManga,
} from "@/lib/public-profile-list";

function createItem(
  id: string,
  title: string,
  options?: {
    favorite?: boolean;
    rating?: number | null;
    genres?: string[];
  },
): MangaListItem {
  return {
    id,
    status: "READING",
    rating: options?.rating ?? null,
    currentChapter: 1,
    notes: null,
    isFavorite: options?.favorite ?? false,
    createdAt: "2026-03-30T00:00:00.000Z",
    manga: {
      id: `m-${id}`,
      malId: Number(id) || 0,
      title,
      coverImage: null,
      author: null,
      genres: options?.genres ?? [],
      totalChapters: null,
      description: null,
      descriptionPt: null,
      publicationStatus: null,
      lastChapter: null,
    },
  };
}

describe("public-profile-list", () => {
  it("filters by title using case-insensitive and accent-insensitive matching", () => {
    const list = [
      createItem("1", "Ação Suprema"),
      createItem("2", "Omniscient Reader"),
      createItem("3", "Solo Leveling"),
    ];

    expect(filterPublicProfileManga(list, "acao").map((item) => item.id)).toEqual([
      "1",
    ]);
    expect(
      filterPublicProfileManga(list, "omniscient").map((item) => item.id),
    ).toEqual(["2"]);
  });

  it("sorts by name and keeps favorites first", () => {
    const list = [
      createItem("1", "Bravo", { favorite: false }),
      createItem("2", "Alpha", { favorite: true }),
      createItem("3", "Zulu", { favorite: false }),
      createItem("4", "Beta", { favorite: true }),
    ];

    const result = sortPublicProfileManga(list, "name", "asc");
    expect(result.map((item) => item.id)).toEqual(["2", "4", "1", "3"]);
  });

  it("sorts by type with title as tie-breaker", () => {
    const list = [
      createItem("1", "Gamma", { genres: ["Fantasy", "Action"] }),
      createItem("2", "Alpha", { genres: ["Adventure"] }),
      createItem("3", "Beta", { genres: ["Adventure"] }),
    ];

    const result = sortPublicProfileManga(list, "type", "asc");
    expect(result.map((item) => item.id)).toEqual(["2", "3", "1"]);
  });

  it("sorts by rating and uses title for ties", () => {
    const list = [
      createItem("1", "Gamma", { rating: 8 }),
      createItem("2", "Alpha", { rating: 9 }),
      createItem("3", "Beta", { rating: 9 }),
      createItem("4", "No Rating", { rating: null }),
    ];

    const result = sortPublicProfileManga(list, "rating", "desc");
    expect(result.map((item) => item.id)).toEqual(["2", "3", "1", "4"]);
  });

  it("paginates with supported page sizes and clamps page boundaries", () => {
    const list = Array.from({ length: 90 }).map((_, index) =>
      createItem(String(index + 1), `Manga ${index + 1}`),
    );

    const firstPage = paginatePublicProfileManga(list, 1, 40);
    const lastPage = paginatePublicProfileManga(list, 999, 40);
    const invalidPageSize = paginatePublicProfileManga(list, 1, 200);

    expect(firstPage.totalPages).toBe(3);
    expect(firstPage.items).toHaveLength(40);
    expect(lastPage.page).toBe(3);
    expect(lastPage.items).toHaveLength(10);
    expect(invalidPageSize.pageSize).toBe(40);
  });
});
