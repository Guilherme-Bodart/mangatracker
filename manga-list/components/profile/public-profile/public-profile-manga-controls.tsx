"use client";

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
  totalFilteredItems: number;
  pageSizeOptions: readonly number[];
  onSearchChange: (value: string) => void;
  onSortByChange: (value: PublicProfileSortBy) => void;
  onSortDirectionChange: (value: PublicProfileSortDirection) => void;
  onPageSizeChange: (value: string) => void;
};

export function PublicProfileMangaControls({
  t,
  searchInput,
  sortBy,
  sortDirection,
  pageSize,
  totalFilteredItems,
  pageSizeOptions,
  onSearchChange,
  onSortByChange,
  onSortDirectionChange,
  onPageSizeChange,
}: PublicProfileMangaControlsProps) {
  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <Input
          value={searchInput}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder={t("controls.searchPlaceholder")}
          aria-label={t("controls.search")}
          className="w-full lg:max-w-xl"
        />

        <div className="grid w-full grid-cols-2 gap-2 lg:w-auto lg:grid-cols-3 [&>*:last-child:nth-child(odd)]:col-span-2 lg:[&>*:last-child:nth-child(odd)]:col-span-1">
          <div>
            <Select
              value={sortBy}
              onValueChange={(value) => onSortByChange(value as PublicProfileSortBy)}
            >
              <SelectTrigger aria-label={t("controls.sortBy")} className="w-full min-w-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="name">{t("controls.sortByOptions.name")}</SelectItem>
                <SelectItem value="type">{t("controls.sortByOptions.type")}</SelectItem>
                <SelectItem value="rating">{t("controls.sortByOptions.rating")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Select
              value={sortDirection}
              onValueChange={(value) =>
                onSortDirectionChange(value as PublicProfileSortDirection)
              }
            >
              <SelectTrigger aria-label={t("controls.direction")} className="w-full min-w-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="asc">{t("controls.directionOptions.asc")}</SelectItem>
                <SelectItem value="desc">{t("controls.directionOptions.desc")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Select value={String(pageSize)} onValueChange={onPageSizeChange}>
              <SelectTrigger aria-label={t("controls.pageSize")} className="w-full min-w-0">
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
        </div>
      </div>

      <div className="text-sm text-muted-foreground">
        <p>{t("controls.results", { count: totalFilteredItems })}</p>
      </div>
    </div>
  );
}
