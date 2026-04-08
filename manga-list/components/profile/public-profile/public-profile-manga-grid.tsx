"use client";

import { AddToListAction } from "@/components/manga/add-to-list-action";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type { MangaListItem } from "@/lib/public-profile-types";
import {
  FALLBACK_COVER_IMAGE,
  formatRating,
  getStatusColor,
  resolveSafeCoverImage,
} from "@/lib/public-profile-utils";
import { Heart, Star } from "lucide-react";

type TranslatorFn = (
  key: string,
  values?: Record<string, string | number | Date>,
) => string;

type PublicProfileMangaGridProps = {
  t: TranslatorFn;
  mangaList: MangaListItem[];
  hasAnyManga: boolean;
  canAddToOwnList?: boolean;
  userMangaMalIds?: Set<number>;
  onSelectManga: (item: MangaListItem) => void;
  onAddedToOwnList?: (malId: number) => void;
  onCopyMangaTitle: (title: string) => Promise<void>;
};

export function PublicProfileMangaGrid({
  t,
  mangaList,
  hasAnyManga,
  canAddToOwnList = false,
  userMangaMalIds,
  onSelectManga,
  onAddedToOwnList,
  onCopyMangaTitle,
}: PublicProfileMangaGridProps) {
  return (
    !hasAnyManga ? (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          {t("emptyList")}
        </CardContent>
      </Card>
    ) : mangaList.length === 0 ? (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          {t("controls.noSearchResults")}
        </CardContent>
      </Card>
    ) : (
      <div className="grid grid-cols-2 gap-4 auto-rows-fr sm:grid-cols-3 sm:gap-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8">
        {mangaList.map((item) => (
          <Card
            key={item.id}
            className="overflow-hidden group hover:shadow-lg hover:scale-[1.02] transition-all cursor-pointer p-0 py-0 gap-0 h-full"
            onClick={() => onSelectManga(item)}
          >
            <div className="relative w-full overflow-hidden" style={{ aspectRatio: "2 / 3" }}>
              <img
                src={resolveSafeCoverImage(item.manga.coverImage, FALLBACK_COVER_IMAGE)}
                alt={item.manga.title}
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
                loading="lazy"
                onError={(event) => {
                  event.currentTarget.src = FALLBACK_COVER_IMAGE;
                  event.currentTarget.classList.remove("object-cover");
                  event.currentTarget.classList.add("object-contain", "bg-muted", "p-3");
                }}
              />

              <div className="pointer-events-none absolute inset-0 bg-black/5 transition-colors duration-200 group-hover:bg-black/35" />
              <div className="pointer-events-none absolute inset-0 z-[2] flex items-center justify-center px-2 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                <div className="flex max-w-full flex-col items-center gap-2">
                  <button
                    type="button"
                    className="pointer-events-auto max-w-full rounded-md bg-black/80 px-3 py-2 text-center text-xs font-semibold leading-tight text-white shadow-lg ring-1 ring-white/20 backdrop-blur-sm line-clamp-3"
                    onClick={(event) => {
                      event.stopPropagation();
                      void onCopyMangaTitle(item.manga.title);
                    }}
                    title={t("details.copyTitle")}
                    aria-label={t("details.copyTitle")}
                  >
                    {item.manga.title}
                  </button>
                  {canAddToOwnList ? (
                    <AddToListAction
                      manga={{
                        mal_id: item.manga.malId,
                        title: item.manga.title,
                        images: {
                          jpg: {
                            large_image_url:
                              resolveSafeCoverImage(
                                item.manga.coverImage,
                                FALLBACK_COVER_IMAGE,
                              ),
                          },
                        },
                      }}
                      isInList={userMangaMalIds?.has(item.manga.malId) ?? false}
                      className="pointer-events-auto gap-1"
                      onSuccess={() => onAddedToOwnList?.(item.manga.malId)}
                    />
                  ) : null}
                </div>
              </div>

              {item.isFavorite && (
                <div className="absolute top-1 right-1 z-[3]">
                  <Heart className="size-5 fill-red-500 text-red-500 drop-shadow-lg" />
                </div>
              )}

              <div className="absolute bottom-1 left-1 z-[3]">
                <Badge className={`${getStatusColor(item.status)} text-[10px] px-1 py-0`}>
                  {t(`status.${item.status.toLowerCase()}`)}
                </Badge>
              </div>

              {item.rating && (
                <div className="absolute bottom-1 right-1 z-[3] bg-black/70 rounded px-1 flex items-center gap-0.5">
                  <Star className="size-3 fill-yellow-500 text-yellow-500" />
                  <span className="text-[10px] text-white font-medium">
                    {formatRating(item.rating)}
                  </span>
                </div>
              )}
            </div>
          </Card>
        ))}
      </div>
    )
  );
}
