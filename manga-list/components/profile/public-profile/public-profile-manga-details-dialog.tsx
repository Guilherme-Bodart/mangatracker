"use client";

import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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

type PublicProfileMangaDetailsDialogProps = {
  t: TranslatorFn;
  locale: string;
  selectedManga: MangaListItem | null;
  statusTranslations: Record<string, string>;
  translateGenre: (genre: string) => string;
  onOpenChange: (open: boolean) => void;
};

export function PublicProfileMangaDetailsDialog({
  t,
  locale,
  selectedManga,
  statusTranslations,
  translateGenre,
  onOpenChange,
}: PublicProfileMangaDetailsDialogProps) {
  return (
    <Dialog open={!!selectedManga} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        {selectedManga && (
          <>
            <DialogHeader>
              <DialogTitle className="text-2xl">{selectedManga.manga.title}</DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground">
                {selectedManga.manga.author}
              </DialogDescription>
            </DialogHeader>

            <div className="grid md:grid-cols-[200px_1fr] gap-6 items-start">
              <div className="flex justify-center">
                <img
                  src={resolveSafeCoverImage(
                    selectedManga.manga.coverImage,
                    FALLBACK_COVER_IMAGE,
                  )}
                  alt={selectedManga.manga.title}
                  referrerPolicy="no-referrer"
                  className="w-full max-w-[200px] rounded-lg shadow-lg"
                  onError={(event) => {
                    event.currentTarget.src = FALLBACK_COVER_IMAGE;
                    event.currentTarget.classList.add("bg-muted", "p-3");
                  }}
                />
              </div>

              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Badge className={getStatusColor(selectedManga.status)}>
                    {t(`status.${selectedManga.status.toLowerCase()}`)}
                  </Badge>
                  {selectedManga.isFavorite && (
                    <div className="flex items-center gap-1 text-red-500">
                      <Heart className="size-4 fill-current" />
                      <span className="text-sm font-medium">{t("details.favorite")}</span>
                    </div>
                  )}
                </div>

                {selectedManga.rating && (
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">{t("details.rating")}</p>
                    <div className="flex items-center gap-1">
                      {Array.from({ length: 5 }, (_, i) => {
                        const starValue = i + 1;
                        const isFilled = selectedManga.rating! >= starValue;
                        const isHalf =
                          selectedManga.rating! >= starValue - 0.5 &&
                          selectedManga.rating! < starValue;

                        return (
                          <Star
                            key={i}
                            className={`size-5 ${
                              isFilled
                                ? "fill-yellow-500 text-yellow-500"
                                : isHalf
                                  ? "fill-yellow-500/50 text-yellow-500"
                                  : "text-gray-300"
                            }`}
                          />
                        );
                      })}
                      <span className="ml-2 font-semibold">{formatRating(selectedManga.rating)}</span>
                    </div>
                  </div>
                )}

                {selectedManga.currentChapter && (
                  <div>
                    <p className="text-sm text-muted-foreground">{t("details.progress")}</p>
                    <p className="font-medium">
                      {t("details.chapter")} {selectedManga.currentChapter}
                      {selectedManga.manga.totalChapters &&
                        ` / ${selectedManga.manga.totalChapters}`}
                    </p>
                  </div>
                )}

                {(selectedManga.manga.publicationStatus || selectedManga.manga.lastChapter) && (
                  <div className="grid grid-cols-2 gap-4">
                    {selectedManga.manga.publicationStatus && (
                      <div>
                        <p className="text-sm text-muted-foreground mb-0.5">
                          {t("details.publicationStatus")}
                        </p>
                        <Badge variant="secondary" className="text-xs">
                          {statusTranslations[selectedManga.manga.publicationStatus] ||
                            selectedManga.manga.publicationStatus}
                        </Badge>
                      </div>
                    )}

                    {selectedManga.manga.lastChapter && (
                      <div>
                        <p className="text-sm text-muted-foreground mb-0.5">
                          {t("details.latestChapter")}
                        </p>
                        <p className="font-medium text-sm">
                          {t("details.chapterShort")} {selectedManga.manga.lastChapter}
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {selectedManga.manga.genres && selectedManga.manga.genres.length > 0 && (
                  <div>
                    <p className="text-sm text-muted-foreground mb-2">{t("details.genres")}</p>
                    <div className="flex flex-wrap gap-1">
                      {selectedManga.manga.genres.map((genre, i) => (
                        <Badge key={i} variant="outline" className="text-xs">
                          {translateGenre(genre)}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                <div className="pt-2 border-t mt-2">
                  <p className="text-sm text-muted-foreground mb-1">{t("details.addedOn")}</p>
                  <p className="font-medium">
                    {new Date(selectedManga.createdAt).toLocaleDateString(
                      locale === "pt" ? "pt-BR" : "en-US",
                    )}
                  </p>
                </div>
              </div>
            </div>

            {selectedManga.notes && (
              <div className="mt-6">
                <p className="text-sm text-muted-foreground mb-2">{t("details.notes")}</p>
                <div className="bg-muted/30 rounded-lg p-4 border italic text-sm leading-relaxed">
                  &ldquo;{selectedManga.notes}&rdquo;
                </div>
              </div>
            )}

            {(selectedManga.manga.descriptionPt || selectedManga.manga.description) && (
              <div className="mt-4">
                <p className="text-sm text-muted-foreground mb-2">{t("details.synopsis")}</p>
                <p className="text-sm leading-relaxed">
                  {locale === "pt" && selectedManga.manga.descriptionPt
                    ? selectedManga.manga.descriptionPt
                    : selectedManga.manga.description}
                </p>
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

