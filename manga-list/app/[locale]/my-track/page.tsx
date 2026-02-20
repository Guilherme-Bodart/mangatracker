"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/contexts/auth-context";
import { useRouter } from "@/i18n/routing";
import { useLocale, useTranslations } from "next-intl";
import { Loader2, Plus, User, Trash2, Edit, Heart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Link } from "@/i18n/routing";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AddMangaModal } from "@/components/manga/add-manga-modal";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { apiRequest, getApiErrorMessage } from "@/lib/api-client";
import { logger } from "@/lib/logger";

interface Manga {
  id: string;
  malId?: number;
  mal_id?: number;
  title: string;
  coverImage: string | null;
  author: string | null;
  genres: string[];
}

interface LatestChapter {
  chapter: string;
  title: string | null;
  publishedAt: string | null;
}

interface UserManga {
  id: string;
  status: "READING" | "COMPLETED" | "PLAN_TO_READ" | "DROPPED";
  rating: number | null;
  currentChapter: number | null;
  notes: string | null;
  isFavorite: boolean;
  manga: Manga;
}

export default function MyTrackPage() {
  const { user, isLoading: isAuthLoading } = useAuth();
  const router = useRouter();
  const t = useTranslations("MyTrack");
  const tProfile = useTranslations("PublicProfile");
  const locale = useLocale();
  const [mangaList, setMangaList] = useState<UserManga[]>([]);
  const [latestChaptersByManga, setLatestChaptersByManga] = useState<
    Record<string, LatestChapter[]>
  >({});
  const [isLoading, setIsLoading] = useState(true);

  // State for actions
  const [selectedManga, setSelectedManga] = useState<UserManga | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isUpdatingChapterByManga, setIsUpdatingChapterByManga] = useState<
    Record<string, boolean>
  >({});

  const fetchMangaList = useCallback(async () => {
    try {
      const data = await apiRequest<UserManga[]>("/manga/list");
      setMangaList(data);

      const latestChaptersData = await apiRequest<Record<string, LatestChapter[]>>(
        "/manga/list/latest-chapters",
      );
      setLatestChaptersByManga(latestChaptersData);
    } catch (error) {
      logger.error("Failed to fetch manga list", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAuthLoading) {
      return;
    }

    if (!user) {
      router.push("/auth/login");
      return;
    }

    fetchMangaList();
  }, [user, isAuthLoading, router, fetchMangaList]);

  const handleEditClick = (manga: UserManga) => {
    setSelectedManga(manga);
    setIsEditModalOpen(true);
  };

  const handleDeleteClick = (manga: UserManga) => {
    setSelectedManga(manga);
    setIsDeleteModalOpen(true);
  };

  const confirmDelete = async () => {
    if (!selectedManga) return;

    setIsDeleting(true);
    try {
      await apiRequest(`/manga/list/${selectedManga.id}`, {
        method: "DELETE",
        csrf: "authenticated-required",
      });

      setMangaList((prev) =>
        prev.filter((item) => item.id !== selectedManga.id),
      );
      toast.success(t("actions.deleteSuccess"));
      setIsDeleteModalOpen(false);
    } catch (error) {
      toast.error(getApiErrorMessage(error, t("actions.deleteError")));
    } finally {
      setIsDeleting(false);
      setSelectedManga(null);
    }
  };

  const handleToggleFavorite = async (
    mangaId: string,
    currentStatus: boolean,
  ) => {
    // Optimistic update
    setMangaList((prev) =>
      prev.map((item) =>
        item.id === mangaId ? { ...item, isFavorite: !currentStatus } : item,
      ),
    );

    try {
      await apiRequest(`/manga/list/${mangaId}/favorite`, {
        method: "PATCH",
        csrf: "authenticated-required",
        body: { isFavorite: !currentStatus },
      });
    } catch (error) {
      // Revert if failed
      setMangaList((prev) =>
        prev.map((item) =>
          item.id === mangaId ? { ...item, isFavorite: currentStatus } : item,
        ),
      );
      toast.error(getApiErrorMessage(error, "Failed to update favorite"));
    }
  };

  const parseChapterNumber = (chapter: string): number | null => {
    const normalized = chapter.trim().replace(",", ".");
    const parsed = Number.parseFloat(normalized);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return null;
    }
    return Math.floor(parsed);
  };

  const handleMarkLatestChaptersAsRead = async (
    userMangaId: string,
    clickedChapter: string,
  ) => {
    const currentItem = mangaList.find((item) => item.id === userMangaId);
    if (!currentItem) return;

    const clickedChapterNumber = parseChapterNumber(clickedChapter);
    if (clickedChapterNumber === null) {
      toast.error(t("chapterRead.noValidChapter"));
      return;
    }

    const currentChapter = currentItem.currentChapter ?? 0;
    const nextChapter = Math.max(currentChapter, clickedChapterNumber);

    if (nextChapter === currentChapter) return;

    setIsUpdatingChapterByManga((prev) => ({ ...prev, [userMangaId]: true }));

    setMangaList((prev) =>
      prev.map((item) =>
        item.id === userMangaId ? { ...item, currentChapter: nextChapter } : item,
      ),
    );

    try {
      await apiRequest(`/manga/list/${userMangaId}`, {
        method: "PATCH",
        csrf: "authenticated-required",
        body: { currentChapter: nextChapter },
      });

      toast.success(t("chapterRead.success", { chapter: nextChapter }));
    } catch (error) {
      setMangaList((prev) =>
        prev.map((item) =>
          item.id === userMangaId
            ? { ...item, currentChapter: currentItem.currentChapter }
            : item,
        ),
      );
      toast.error(getApiErrorMessage(error, t("chapterRead.error")));
    } finally {
      setIsUpdatingChapterByManga((prev) => ({
        ...prev,
        [userMangaId]: false,
      }));
    }
  };

  const favoriteCount = mangaList.filter((m) => m.isFavorite).length;

  return (
    <div className="min-h-screen">
      {/* Banner Section */}
      <div className="relative h-64 md:h-80 bg-gradient-to-br from-primary/20 via-primary/10 to-background overflow-hidden">
        {user?.bannerUrl ? (
          <img
            src={user.bannerUrl}
            alt="Banner"
            className="w-full h-full object-cover object-center"
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-purple-500/20 via-pink-500/20 to-orange-500/20" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/50 to-transparent" />

        {/* Avatar Overlay */}
        <div className="absolute bottom-0 left-0 right-0 container mx-auto px-4">
          <div className="flex items-end gap-4 pb-6">
            <Avatar className="size-24 md:size-32 border-4 border-background shadow-xl">
              <AvatarImage
                src={user?.avatarUrl || undefined}
                alt={user?.username}
              />
              <AvatarFallback className="bg-primary text-primary-foreground text-3xl">
                <User className="size-12" />
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 pb-2">
              <h1 className="text-2xl md:text-4xl font-bold text-foreground">
                {user?.username}
              </h1>
              <div className="flex gap-4 mt-2 text-sm text-muted-foreground">
                <span>
                  {tProfile("stats.totalManga")}:{" "}
                  <strong className="text-foreground">
                    {mangaList.length}
                  </strong>
                </span>
                <span>
                  {tProfile("stats.favorites")}:{" "}
                  <strong className="text-foreground">{favoriteCount}</strong>
                </span>
              </div>
            </div>
            <div className="pb-2">
              <Button asChild variant="outline">
                <Link href="/profile">{tProfile("editProfile")}</Link>
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Manga List */}
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-8">
          <h2 className="text-2xl font-semibold">{t("title")}</h2>
          <Button asChild>
            <Link href="/manga">
              <Plus className="mr-2 h-4 w-4" />
              {t("browseManga")}
            </Link>
          </Button>
        </div>

        {isLoading ? (
          <div className="flex min-h-[240px] items-center justify-center">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
          </div>
        ) : mangaList.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-xl font-semibold mb-2">{t("empty")}</p>
            <p className="text-muted-foreground mb-6">{t("addFirst")}</p>
            <Button asChild>
              <Link href="/manga">
                <Plus className="mr-2 h-4 w-4" />
                {t("title")}
              </Link>
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-6">
            {mangaList.map((item) => (
              <MangaCard
                key={item.id}
                userManga={item}
                latestChapters={latestChaptersByManga[item.manga.id] || []}
                locale={locale}
                isUpdatingChapter={!!isUpdatingChapterByManga[item.id]}
                onEdit={() => handleEditClick(item)}
                onDelete={() => handleDeleteClick(item)}
                onMarkLatestChaptersAsRead={(chapter) =>
                  handleMarkLatestChaptersAsRead(item.id, chapter)
                }
                onToggleFavorite={() =>
                  handleToggleFavorite(item.id, item.isFavorite)
                }
              />
            ))}
          </div>
        )}
      </div>

      {/* Edit Modal */}
      {selectedManga && (
        <AddMangaModal
          open={isEditModalOpen}
          onOpenChange={setIsEditModalOpen}
          manga={{
            ...selectedManga.manga,
            mal_id: selectedManga.manga.mal_id ?? selectedManga.manga.malId ?? 0,
            images: {
              jpg: { large_image_url: selectedManga.manga.coverImage || "" },
            },
          }}
          mode="edit"
          initialData={{
            status: selectedManga.status,
            rating: selectedManga.rating || 0,
            currentChapter: selectedManga.currentChapter?.toString() || "",
            notes: selectedManga.notes || "",
          }}
          userMangaId={selectedManga.id}
          onSuccess={fetchMangaList}
        />
      )}

      {/* Delete Confirmation Modal */}
      <Dialog open={isDeleteModalOpen} onOpenChange={setIsDeleteModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("actions.delete")}</DialogTitle>
            <DialogDescription>{t("actions.confirmDelete")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsDeleteModalOpen(false)}
              disabled={isDeleting}
            >
              {t("actions.cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDelete}
              disabled={isDeleting}
            >
              {isDeleting ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                t("actions.delete")
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MangaCard({
  userManga,
  latestChapters,
  locale,
  isUpdatingChapter,
  onEdit,
  onDelete,
  onMarkLatestChaptersAsRead,
  onToggleFavorite,
}: {
  userManga: UserManga;
  latestChapters: LatestChapter[];
  locale: string;
  isUpdatingChapter: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onMarkLatestChaptersAsRead: (chapter: string) => void;
  onToggleFavorite: () => void;
}) {
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
          src={manga.coverImage || "/placeholder-manga.png"}
          alt={manga.title}
          className="w-full h-full object-cover transition-transform group-hover:scale-105"
        />

        {/* Favorite Toggle */}
        <button
          onClick={(e) => {
            e.stopPropagation();
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
            <p className="text-white font-medium text-sm line-clamp-2">
              {manga.title}
            </p>
            {currentChapter && (
              <p className="text-white/80 text-xs mt-1">
                {t("details.chapter")} {currentChapter}
              </p>
            )}
          </div>
        </div>

        {/* Action Buttons Overlay */}
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/40 gap-2">
          <Button size="icon" variant="secondary" onClick={onEdit} title="Edit">
            <Edit className="size-4" />
          </Button>
          <Button
            size="icon"
            variant="destructive"
            onClick={onDelete}
            title="Delete"
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      </div>

      <div className="p-3">
        <div className="flex items-center justify-between">
          <span
            className={`${statusColors[status]} text-white text-xs px-2 py-1 rounded-full`}
          >
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
            <p className="text-[11px] text-muted-foreground">
              {tMyTrack("noChapterData")}
            </p>
          ) : (
            <div className="space-y-1">
              {latestChapters.map((chapter) => {
                const parsedChapter = Number.parseFloat(
                  chapter.chapter.replace(",", "."),
                );
                const isRead =
                  Number.isFinite(parsedChapter) &&
                  (currentChapter ?? 0) >= parsedChapter;

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
                      {isRead
                        ? tMyTrack("chapterRead.read")
                        : tMyTrack("chapterRead.unread")}
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
