"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Edit, Heart, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import type { LatestChapter, UserManga } from "@/lib/my-track-types";

function resolveSafeCoverImage(
  coverImage: string | null | undefined,
  fallback: string,
): string {
  const normalized = String(coverImage || "").trim();
  if (!normalized) {
    return fallback;
  }

  try {
    const parsed = new URL(normalized);
    return parsed.toString();
  } catch {
    return fallback;
  }
}

type MyTrackCardProps = {
  userManga: UserManga;
  latestChapters: LatestChapter[];
  locale: string;
  isUpdatingChapter: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onMarkLatestChaptersAsRead: (chapter: string) => void;
  onToggleFavorite: () => void;
};

export function MyTrackCard({
  userManga,
  latestChapters,
  locale,
  isUpdatingChapter,
  onEdit,
  onDelete,
  onMarkLatestChaptersAsRead,
  onToggleFavorite,
}: MyTrackCardProps) {
  const { manga, status, rating, currentChapter, isFavorite } = userManga;
  const t = useTranslations("PublicProfile");
  const tMyTrack = useTranslations("MyTrack");

  const statusColors = {
    READING: "bg-blue-500",
    COMPLETED: "bg-green-500",
    PLAN_TO_READ: "bg-yellow-500",
    DROPPED: "bg-red-500",
  };
  const formatRating = (value: number) =>
    Number.isInteger(value) ? String(value) : value.toFixed(1);

  return (
    <div className="group relative overflow-hidden rounded-lg border bg-card transition-all hover:shadow-lg hover:border-primary/50">
      <div className="aspect-[3/4] relative overflow-hidden">
        <img
          src={resolveSafeCoverImage(manga.coverImage, "/placeholder-manga.png")}
          alt={manga.title}
          referrerPolicy="no-referrer"
          className="w-full h-full object-cover transition-transform group-hover:scale-105"
          onError={(event) => {
            event.currentTarget.src = "/placeholder-manga.png";
          }}
        />

        <button
          onClick={(event) => {
            event.stopPropagation();
            onToggleFavorite();
          }}
          className="absolute top-2 right-2 p-1.5 rounded-full bg-black/50 hover:bg-black/70 transition-colors z-10"
        >
          <Heart
            className={cn(
              "size-5 transition-colors",
              isFavorite ? "fill-red-500 text-red-500" : "text-white",
            )}
          />
        </button>

        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
          <div className="absolute bottom-0 left-0 right-0 p-3">
            <p className="text-white font-medium text-sm line-clamp-2">{manga.title}</p>
            {currentChapter && (
              <p className="text-white/80 text-xs mt-1">
                {t("details.chapter")} {currentChapter}
              </p>
            )}
          </div>
        </div>

        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/40 gap-2">
          <Button size="icon" variant="secondary" onClick={onEdit} title={tMyTrack("actions.edit")}>
            <Edit className="size-4" />
          </Button>
          <Button
            size="icon"
            variant="destructive"
            onClick={onDelete}
            title={tMyTrack("actions.delete")}
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      </div>

      <div className="p-3">
        <div className="flex items-center justify-between">
          <span className={`${statusColors[status]} text-white text-xs px-2 py-1 rounded-full`}>
            {t(
              `status.${status.toLowerCase().replace(/_/g, "") as "reading" | "completed" | "planToRead" | "dropped"}`,
            )}
          </span>
          {rating && (
            <div className="flex items-center gap-1">
              <span className="text-yellow-500">★</span>
              <span className="text-sm font-medium">{formatRating(rating)}</span>
            </div>
          )}
        </div>

        <div className="mt-2 border-t pt-2">
          <p className="mb-1 text-[11px] font-semibold text-muted-foreground">
            {tMyTrack("latestChapters")}
          </p>
          {latestChapters.length === 0 ? (
            <p className="text-[11px] text-muted-foreground">{tMyTrack("noChapterData")}</p>
          ) : (
            <div className="space-y-1">
              {latestChapters.map((chapter) => {
                const parsedChapter = Number.parseFloat(chapter.chapter.replace(",", "."));
                const isRead =
                  Number.isFinite(parsedChapter) && (currentChapter ?? 0) >= parsedChapter;

                return (
                  <div
                    key={`${chapter.chapter}-${chapter.publishedAt ?? "no-date"}`}
                    className="flex items-center justify-between gap-2 text-[11px] leading-tight"
                  >
                    <div className="min-w-0 flex items-center gap-1.5">
                      <span className="font-medium">
                        {tMyTrack("chapterLabel")} {chapter.chapter}
                      </span>
                      {chapter.publishedAt && (
                        <span className="truncate text-muted-foreground">
                          {new Date(chapter.publishedAt).toLocaleDateString(
                            locale === "pt" ? "pt-BR" : "en-US",
                          )}
                        </span>
                      )}
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant={isRead ? "default" : "outline"}
                      className={cn(
                        "h-5 shrink-0 px-1.5 text-[10px] font-semibold leading-none",
                        isRead && "bg-green-600 hover:bg-green-600",
                      )}
                      onClick={() => onMarkLatestChaptersAsRead(chapter.chapter)}
                      disabled={isUpdatingChapter}
                    >
                      {isRead ? tMyTrack("chapterRead.read") : tMyTrack("chapterRead.unread")}
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

