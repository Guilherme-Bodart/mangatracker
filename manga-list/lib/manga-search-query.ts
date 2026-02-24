export type GenreMode = "OR" | "AND";
export type BrowseProvider = "jikan" | "anilist";

export type BuildBrowseMangaEndpointInput = {
  allowNsfw: boolean;
  debouncedSearch: string;
  selectedGenres: number[];
  genreMode: GenreMode;
  selectedType: string;
  page: number;
  provider: BrowseProvider;
};

function shouldSkipSearch(query: string): boolean {
  return query.length > 0 && query.length < 3;
}

export function buildBrowseMangaEndpoint(
  input: BuildBrowseMangaEndpointInput,
): string | null {
  const query = input.debouncedSearch.trim();
  if (shouldSkipSearch(query)) {
    return null;
  }

  const queryParams = new URLSearchParams();
  queryParams.set("page", String(input.page));
  queryParams.set("allowNsfw", String(input.allowNsfw));

  let endpoint = "";
  if (query) {
    endpoint = "/manga/search";
    queryParams.set("q", query);
  } else if (
    input.provider === "jikan" &&
    input.selectedGenres.length === 0 &&
    input.selectedType === "all"
  ) {
    endpoint = "/manga/top";
  } else {
    endpoint = "/manga/search";
    queryParams.set("q", "");
  }

  if (endpoint === "/manga/search") {
    queryParams.set("provider", input.provider);
  }

  if (input.selectedType && input.selectedType !== "all") {
    queryParams.set("type", input.selectedType);
  }

  if (input.selectedGenres.length > 0) {
    queryParams.set("genres", input.selectedGenres.join(","));
    queryParams.set("genresMode", input.genreMode);
  }

  return `${endpoint}?${queryParams.toString()}`;
}
