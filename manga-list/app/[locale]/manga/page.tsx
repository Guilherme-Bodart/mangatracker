"use client";

import { useState, useEffect } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, Filter, Plus, Loader2 } from "lucide-react";
import { AddMangaModal } from "@/components/manga/add-manga-modal";
import { toast } from "sonner";
import { useDebounce } from "@/hooks/use-debounce";
import { useAuth } from "@/contexts/auth-context";

// Common manga genres (MAL genre IDs)
const GENRES = [
  { id: 1, name: "Ação", nameEn: "Action" },
  { id: 2, name: "Aventura", nameEn: "Adventure" },
  { id: 4, name: "Comédia", nameEn: "Comedy" },
  { id: 8, name: "Drama", nameEn: "Drama" },
  { id: 10, name: "Fantasia", nameEn: "Fantasy" },
  { id: 14, name: "Horror", nameEn: "Horror" },
  { id: 22, name: "Romance", nameEn: "Romance" },
  { id: 24, name: "Ficção Científica", nameEn: "Sci-Fi" },
  { id: 36, name: "Slice of Life", nameEn: "Slice of Life" },
  { id: 37, name: "Sobrenatural", nameEn: "Supernatural" },
];

interface Manga {
  mal_id: number;
  title: string;
  title_english?: string;
  images: {
    jpg: {
      large_image_url: string;
    };
  };
  score?: number;
  genres?: Array<{ mal_id: number; name: string }>;
  synopsis?: string;
  status?: string;
  chapters?: number;
}

const statusTranslations: Record<string, string> = {
  Publishing: "Em lançamento",
  Finished: "Completo",
  "On Hiatus": "Em hiato",
  Discontinued: "Descontinuado",
  "Not yet aired": "Não lançado",
};

export default function BrowsePage() {
  const t = useTranslations("Browse");
  const locale = useLocale();
  const { user } = useAuth();
  const allowNsfw = !!user?.allowNsfw;

  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearch = useDebounce(searchQuery, 500);

  const [selectedGenres, setSelectedGenres] = useState<number[]>([]);
  const [genreMode, setGenreMode] = useState<"OR" | "AND">("OR");
  const [selectedType, setSelectedType] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [hasNextPage, setHasNextPage] = useState(true);
  const [mangas, setMangas] = useState<Manga[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [selectedManga, setSelectedManga] = useState<Manga | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    // Reset page when filters change
    setPage(1);
  }, [debouncedSearch, selectedGenres, genreMode, selectedType]);

  useEffect(() => {
    const fetchMangas = async () => {
      // Don't search if query is too short (unless empty to show top manga)
      if (debouncedSearch.length > 0 && debouncedSearch.length < 3) return;

      setIsLoading(true);
      try {
        const API_URL =
          process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
        let url = "";

        if (debouncedSearch) {
          url = `${API_URL}/manga/search?q=${encodeURIComponent(debouncedSearch)}&page=${page}&allowNsfw=${allowNsfw}`;
        } else {
          // If no search, show top manga
          // Only fetch top manga if no genres selected either
          if (selectedGenres.length === 0 && selectedType === "all") {
            url = `${API_URL}/manga/top?page=${page}&allowNsfw=${allowNsfw}`;
          } else {
            // If genres selected but no text, still use search endpoint
            url = `${API_URL}/manga/search?q=&page=${page}&allowNsfw=${allowNsfw}`;
          }
        }

        // Add filters
        if (selectedType && selectedType !== "all") {
          url += `&type=${selectedType}`;
        }

        if (selectedGenres.length > 0) {
          url += `&genres=${selectedGenres.join(",")}&genresMode=${genreMode}`;
        }

        const response = await fetch(url);
        const data = await response.json();

        const newMangas = data.data || [];
        setMangas(newMangas);
        setHasNextPage(
          data.pagination?.has_next_page || newMangas.length === 20,
        );
      } catch (error) {
        toast.error("Error searching manga");
        console.error(error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchMangas();
  }, [allowNsfw, debouncedSearch, selectedGenres, genreMode, selectedType, page]);

  const toggleGenre = (genreId: number) => {
    setSelectedGenres((prev) =>
      prev.includes(genreId)
        ? prev.filter((id) => id !== genreId)
        : [...prev, genreId],
    );
  };

  const handlePrevPage = () => {
    setPage((p) => Math.max(1, p - 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleNextPage = () => {
    setPage((p) => p + 1);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleAddToList = (manga: Manga) => {
    setSelectedManga(manga);
    setIsModalOpen(true);
  };

  const showInitialSkeleton = isLoading && mangas.length === 0;

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">{t("title")}</h1>
        <p className="text-muted-foreground">{t("startSearching")}</p>
      </div>

      {/* Search Bar */}
      <div className="flex gap-2 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            placeholder={t("searchPlaceholder")}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button disabled={isLoading}>
          {isLoading ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            t("search")
          )}
        </Button>
        <Button variant="outline" onClick={() => setShowFilters(!showFilters)}>
          <Filter className="size-4 mr-2" />
          {t("filters")}
        </Button>
      </div>

      {/* Genre Filters */}
      {showFilters && (
        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="space-y-4">
              <div>
                <Label className="text-base font-semibold mb-3 block">
                  {t("genres")}
                </Label>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                  {GENRES.map((genre) => (
                    <div key={genre.id} className="flex items-center space-x-2">
                      <Checkbox
                        id={`genre-${genre.id}`}
                        checked={selectedGenres.includes(genre.id)}
                        onCheckedChange={() => toggleGenre(genre.id)}
                      />
                      <Label
                        htmlFor={`genre-${genre.id}`}
                        className="text-sm cursor-pointer"
                      >
                        {locale === "pt" ? genre.name : genre.nameEn}
                      </Label>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <Label className="text-base font-semibold mb-3 block">
                  {t("filterMode")}
                </Label>
                <RadioGroup
                  value={genreMode}
                  onValueChange={(value) => setGenreMode(value as "OR" | "AND")}
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="OR" id="or" />
                    <Label htmlFor="or" className="cursor-pointer">
                      {t("matchAny")}
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="AND" id="and" />
                    <Label htmlFor="and" className="cursor-pointer">
                      {t("matchAll")}
                    </Label>
                  </div>
                </RadioGroup>
              </div>

              <div>
                <Label className="text-base font-semibold mb-3 block">
                  {t("type")}
                </Label>
                <Select value={selectedType} onValueChange={setSelectedType}>
                  <SelectTrigger className="w-full md:w-[200px]">
                    <SelectValue placeholder={t("types.all")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t("types.all")}</SelectItem>
                    <SelectItem value="manga">{t("types.manga")}</SelectItem>
                    <SelectItem value="manhwa">{t("types.manhwa")}</SelectItem>
                    <SelectItem value="manhua">{t("types.manhua")}</SelectItem>
                    <SelectItem value="novel">{t("types.novel")}</SelectItem>
                    <SelectItem value="oneshot">
                      {t("types.oneshot")}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
      {/* Results */}
      <div className="relative">
        {showInitialSkeleton ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {Array.from({ length: 20 }).map((_, index) => (
              <Card key={`skeleton-${index}`} className="overflow-hidden">
                <div className="aspect-[2/3] bg-muted animate-pulse" />
                <CardContent className="p-3 space-y-2">
                  <div className="h-4 bg-muted rounded animate-pulse" />
                  <div className="h-3 w-2/3 bg-muted rounded animate-pulse" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : mangas.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {mangas.map((manga, index) => (
              <Card
                key={`${manga.mal_id}-${page}-${index}`}
                className="overflow-hidden group hover:shadow-lg transition-shadow"
              >
                <div className="aspect-[2/3] relative overflow-hidden">
                  <img
                    src={manga.images.jpg.large_image_url}
                    alt={manga.title}
                    className="object-cover w-full h-full group-hover:scale-105 transition-transform"
                  />
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <Button
                      size="sm"
                      onClick={() => handleAddToList(manga)}
                      className="gap-1 cursor-pointer"
                    >
                      <Plus className="size-4" />
                      {t("addToList")}
                    </Button>
                  </div>
                </div>
                <CardContent className="p-3">
                  <div className="flex justify-between items-start gap-2 mb-2">
                    <h3
                      className="font-semibold text-sm line-clamp-2"
                      title={manga.title}
                    >
                      {manga.title}
                    </h3>
                    {manga.score && (
                      <Badge
                        variant="secondary"
                        className="text-[10px] px-1 h-5 shrink-0"
                      >
                        ⭐ {manga.score}
                      </Badge>
                    )}
                  </div>

                  <div className="space-y-2">
                    {/* Status & Chapters */}
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>
                        {manga.status
                          ? locale === "pt"
                            ? statusTranslations[manga.status] || manga.status
                            : manga.status
                          : "Unknown"}
                      </span>
                      {manga.chapters && (
                        <span className="font-medium">
                          {manga.chapters} {locale === "pt" ? "Caps" : "Chs"}
                        </span>
                      )}
                    </div>

                    {/* Genres */}
                    {manga.genres && manga.genres.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {manga.genres.slice(0, 3).map((genre) => (
                          <span
                            key={genre.mal_id}
                            className="text-[10px] px-1.5 py-0.5 bg-secondary text-secondary-foreground rounded-full whitespace-nowrap"
                          >
                            {genre.name}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="text-center py-12">
            <p className="text-muted-foreground">
              {isLoading ? t("loading") : t("noResults")}
            </p>
          </div>
        )}

        {isLoading && mangas.length > 0 && (
          <div className="absolute inset-0 bg-background/70 backdrop-blur-[1px] flex items-center justify-center rounded-md">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              <span>{t("loading")}</span>
            </div>
          </div>
        )}
      </div>
      {/* Pagination */}
      {mangas.length > 0 && (
        <div className="flex justify-center items-center gap-4 mt-8">
          <Button
            variant="outline"
            onClick={handlePrevPage}
            className="cursor-pointer"
            disabled={page === 1 || isLoading}
          >
            {t("previous")}
          </Button>
          <span className="text-sm font-medium">
            {t("page")} {page}
          </span>
          <Button
            variant="outline"
            onClick={handleNextPage}
            className="cursor-pointer"
            disabled={!hasNextPage || isLoading}
          >
            {t("next")}
          </Button>
        </div>
      )}

      {/* Add to List Modal */}
      {selectedManga && (
        <AddMangaModal
          manga={selectedManga}
          open={isModalOpen}
          onOpenChange={setIsModalOpen}
        />
      )}
    </div>
  );
}

