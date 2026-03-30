"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  PublicProfileSortBy,
  PublicProfileSortDirection,
} from "@/lib/public-profile-list";

type TranslatorFn = (
  key: string,
  values?: Record<string, string | number | Date>,
) => string;

type PublicProfileMangaControlsProps = {
  t: TranslatorFn;
  searchInput: string;
  sortBy: PublicProfileSortBy;
  sortDirection: PublicProfileSortDirection;
  pageSize: number;
  currentPage: number;
  totalPages: number;
  totalFilteredItems: number;
  pageSizeOptions: readonly number[];
  onSearchChange: (value: string) => void;
  onSortByChange: (value: PublicProfileSortBy) => void;
  onSortDirectionChange: (value: PublicProfileSortDirection) => void;
  onPageSizeChange: (value: string) => void;
  onPageChange: (page: number) => void;
};

export function PublicProfileMangaControls({
  t,
  searchInput,
  sortBy,
  sortDirection,
  pageSize,
  currentPage,
  totalPages,
  totalFilteredItems,
  pageSizeOptions,
  onSearchChange,
  onSortByChange,
  onSortDirectionChange,
  onPageSizeChange,
  onPageChange,
}: PublicProfileMangaControlsProps) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-2 md:grid-cols-[1.6fr_0.9fr_0.9fr_0.7fr]">
        <Input
          value={searchInput}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder={t("controls.searchPlaceholder")}
          aria-label={t("controls.search")}
        />

        <Select
          value={sortBy}
          onValueChange={(value) => onSortByChange(value as PublicProfileSortBy)}
        >
          <SelectTrigger aria-label={t("controls.sortBy")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="name">{t("controls.sortByOptions.name")}</SelectItem>
            <SelectItem value="type">{t("controls.sortByOptions.type")}</SelectItem>
            <SelectItem value="rating">{t("controls.sortByOptions.rating")}</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={sortDirection}
          onValueChange={(value) =>
            onSortDirectionChange(value as PublicProfileSortDirection)
          }
        >
          <SelectTrigger aria-label={t("controls.direction")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="asc">{t("controls.directionOptions.asc")}</SelectItem>
            <SelectItem value="desc">{t("controls.directionOptions.desc")}</SelectItem>
          </SelectContent>
        </Select>

        <Select value={String(pageSize)} onValueChange={onPageSizeChange}>
          <SelectTrigger aria-label={t("controls.pageSize")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {pageSizeOptions.map((option) => (
              <SelectItem key={option} value={String(option)}>
                {t("controls.pageSizeItem", { value: option })}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
        <p>{t("controls.results", { count: totalFilteredItems })}</p>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onPageChange(currentPage - 1)}
            disabled={currentPage <= 1}
          >
            {t("controls.previousPage")}
          </Button>
          <span className="min-w-24 text-center">
            {t("controls.pageLabel", { page: currentPage, total: totalPages })}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onPageChange(currentPage + 1)}
            disabled={currentPage >= totalPages}
          >
            {t("controls.nextPage")}
          </Button>
        </div>
      </div>
    </div>
  );
}
