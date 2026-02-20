import { describe, expect, it } from "vitest";

import { buildBrowseMangaEndpoint } from "@/lib/manga-search-query";

describe("buildBrowseMangaEndpoint", () => {
  it("returns null when search query is shorter than 3 chars", () => {
    const endpoint = buildBrowseMangaEndpoint({
      allowNsfw: false,
      debouncedSearch: "ab",
      selectedGenres: [],
      genreMode: "OR",
      selectedType: "all",
      page: 1,
    });

    expect(endpoint).toBeNull();
  });

  it("returns top endpoint when query is empty and no filters are selected", () => {
    const endpoint = buildBrowseMangaEndpoint({
      allowNsfw: true,
      debouncedSearch: "",
      selectedGenres: [],
      genreMode: "OR",
      selectedType: "all",
      page: 2,
    });

    expect(endpoint).toBe("/manga/top?page=2&allowNsfw=true");
  });

  it("returns search endpoint with query and filters", () => {
    const endpoint = buildBrowseMangaEndpoint({
      allowNsfw: false,
      debouncedSearch: "berserk",
      selectedGenres: [1, 2],
      genreMode: "AND",
      selectedType: "manga",
      page: 3,
    });

    expect(endpoint).toBe(
      "/manga/search?page=3&allowNsfw=false&q=berserk&type=manga&genres=1%2C2&genresMode=AND",
    );
  });

  it("uses search endpoint with empty q when only filters are selected", () => {
    const endpoint = buildBrowseMangaEndpoint({
      allowNsfw: false,
      debouncedSearch: "",
      selectedGenres: [10],
      genreMode: "OR",
      selectedType: "all",
      page: 1,
    });

    expect(endpoint).toBe(
      "/manga/search?page=1&allowNsfw=false&q=&genres=10&genresMode=OR",
    );
  });
});
