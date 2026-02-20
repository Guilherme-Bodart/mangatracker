"use client";

import { useEffect, useMemo, useState } from "react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { User, BookOpen, Star, Heart } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import { Link, usePathname } from "@/i18n/routing";
import { useAuth } from "@/contexts/auth-context";
import { apiRequest, getApiErrorMessage } from "@/lib/api-client";
import { toast } from "sonner";

interface MangaListItem {
  id: string;
  status: string;
  rating: number | null;
  currentChapter: number | null;
  notes: string | null;
  isFavorite: boolean;
  createdAt: string;
  manga: {
    id: string;
    malId: number;
    title: string;
    coverImage: string | null;
    author: string | null;
    genres: string[];
    totalChapters: number | null;
    description: string | null;
    descriptionPt: string | null;
    publicationStatus: string | null;
    lastChapter: string | null;
  };
}

interface UserData {
  user: {
    id: string;
    username: string;
    avatarUrl: string | null;
    bannerUrl: string | null;
    totalLikes: number;
  };
  mangaList: MangaListItem[];
  stats: {
    total: number;
    reading: number;
    completed: number;
    planToRead: number;
    dropped: number;
    favorites: number;
  };
}

export default function PublicProfilePage() {
  const pathname = usePathname();
  const username = useMemo(() => {
    const segments = pathname.split("/").filter(Boolean);
    if (segments[0] !== "user" || !segments[1]) {
      return "";
    }
    return decodeURIComponent(segments[1]);
  }, [pathname]);
  const t = useTranslations("PublicProfile");
  const locale = useLocale();
  const { user: authUser, isLoading: authLoading } = useAuth();

  const genreTranslations: Record<string, string> = {
    Action: "Ação",
    Adventure: "Aventura",
    Comedy: "Comédia",
    Drama: "Drama",
    Fantasia: "Fantasia",
    Fantasy: "Fantasia",
    Magic: "Magia",
    Supernatural: "Sobrenatural",
    Horror: "Terror",
    Mystery: "Mistério",
    Psychological: "Psicológico",
    Romance: "Romance",
    "Sci-Fi": "Ficção Científica",
    SliceOfLife: "Cotidiano",
    "Slice of Life": "Cotidiano",
    Sports: "Esportes",
    Historical: "Histórico",
    Military: "Militar",
    School: "Escolar",
    Seinen: "Seinen",
    Shoujo: "Shoujo",
    Shounen: "Shounen",
    Josei: "Josei",
    Ecchi: "Ecchi",
    Harem: "Harem",
    Mecha: "Mecha",
    Music: "Música",
    Parody: "Paródia",
    Police: "Policial",
    Space: "Espacial",
    Suspense: "Suspense",
    Thriller: "Thriller",
    Vampire: "Vampiros",
    Yaoi: "Yaoi",
    Yuri: "Yuri",
    Isekai: "Isekai",
  };

  const statusTranslations: Record<string, string> = {
    Publishing: "Em lançamento",
    Finished: "Completo",
    "On Hiatus": "Em hiato",
    Discontinued: "Descontinuado",
    "Not yet aired": "Não lançado",
  };

  const [userData, setUserData] = useState<UserData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedManga, setSelectedManga] = useState<MangaListItem | null>(
    null,
  );
  const [isLikeLoading, setIsLikeLoading] = useState(false);
  const [isLikedByMe, setIsLikedByMe] = useState(false);
  const [isOwnProfile, setIsOwnProfile] = useState(false);

  useEffect(() => {
    if (!username) {
      setError("Failed to load profile");
      setIsLoading(false);
      return;
    }

    const fetchUserData = async () => {
      try {
        const data = await apiRequest<UserData>(
          `/manga/user/${encodeURIComponent(username)}`,
        );
        setUserData(data);
        setError(null);
      } catch (err: unknown) {
        setError(getApiErrorMessage(err, "Failed to load profile"));
      } finally {
        setIsLoading(false);
      }
    };

    fetchUserData();
  }, [username]);

  useEffect(() => {
    if (!username) return;

    const fetchLikeState = async () => {
      if (authLoading || !authUser) return;

      try {
        const data = await apiRequest<{
          liked: boolean;
          isOwnProfile: boolean;
          totalLikes: number;
        }>(`/manga/user/${encodeURIComponent(username)}/like-state`);

        setIsLikedByMe(data.liked);
        setIsOwnProfile(data.isOwnProfile);
        setUserData((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            user: {
              ...prev.user,
              totalLikes: data.totalLikes,
            },
          };
        });
      } catch {
        // Ignore like state failures for anonymous-like experience.
      }
    };

    void fetchLikeState();
  }, [authLoading, authUser, username]);

  const handleToggleLike = async () => {
    if (!authUser || isOwnProfile || isLikeLoading) return;

    try {
      setIsLikeLoading(true);
      const data = await apiRequest<{ liked: boolean; totalLikes: number }>(
        `/manga/user/${encodeURIComponent(username)}/like`,
        {
          method: "POST",
          csrf: "authenticated-required",
        },
      );
      setIsLikedByMe(data.liked);
      setUserData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          user: {
            ...prev.user,
            totalLikes: data.totalLikes,
          },
        };
      });
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Failed to toggle like"));
    } finally {
      setIsLikeLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      READING: "bg-blue-500",
      COMPLETED: "bg-green-500",
      PLAN_TO_READ: "bg-yellow-500",
      DROPPED: "bg-red-500",
    };
    return colors[status] || "bg-gray-500";
  };
  const formatRating = (value: number) =>
    Number.isInteger(value) ? String(value) : value.toFixed(1);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">{t("loading")}</p>
        </div>
      </div>
    );
  }

  if (error || !userData) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <User className="size-16 text-muted-foreground mx-auto mb-4" />
          <h1 className="text-2xl font-bold mb-2">{t("notFound")}</h1>
          <p className="text-muted-foreground">{t("notFoundDesc")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-8">
      {/* Banner Section */}
      <div className="relative h-64 bg-gradient-to-r from-primary/20 to-primary/5">
        {userData.user.bannerUrl && (
          <img
            src={userData.user.bannerUrl}
            alt="Banner"
            className="w-full h-full object-cover"
          />
        )}

        {/* Avatar Overlay */}
        <div className="absolute -bottom-16 left-8">
          <Avatar className="size-32 border-4 border-background">
            <AvatarImage src={userData.user.avatarUrl || undefined} />
            <AvatarFallback className="bg-primary/10 text-primary text-3xl">
              <User className="size-16" />
            </AvatarFallback>
          </Avatar>
        </div>
      </div>

      {/* User Info */}
      <div className="container mx-auto px-4 mt-20">
        <div className="mb-6">
          <div className="mb-2 flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-bold">@{userData.user.username}</h1>
            {!authLoading && !authUser && (
              <Button asChild size="sm" variant="outline">
                <Link href="/auth/login">{t("likeToLogin")}</Link>
              </Button>
            )}
            {!authLoading && authUser && !isOwnProfile && (
              <Button
                size="sm"
                variant={isLikedByMe ? "default" : "outline"}
                onClick={handleToggleLike}
                disabled={isLikeLoading}
                className="gap-2"
              >
                <Heart className={`size-4 ${isLikedByMe ? "fill-current" : ""}`} />
                {isLikedByMe ? t("unlikeProfile") : t("likeProfile")}
              </Button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1 text-sm text-muted-foreground">
              <Heart className="size-4 text-red-500" />
              <strong className="text-foreground">{userData.user.totalLikes}</strong>
              <span>{t("likes")}</span>
            </div>
          </div>

          {/* Stats */}
          <div className="flex flex-wrap gap-4 mt-4">
            <div className="flex items-center gap-2">
              <BookOpen className="size-4 text-muted-foreground" />
              <span className="text-sm">
                <strong>{userData.mangaList?.length || 0}</strong>{" "}
                {t("stats.total")}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Heart className="size-4 text-red-500 fill-red-500" />
              <span className="text-sm">
                <strong>{userData.stats?.favorites || 0}</strong>{" "}
                {t("stats.favorites")}
              </span>
            </div>
          </div>
        </div>

        {/* Manga Grid */}
        <div className="space-y-4">
          <h2 className="text-2xl font-bold">{t("mangaList")}</h2>

          {!userData.mangaList || userData.mangaList.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                {t("emptyList")}
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8 gap-3">
              {userData.mangaList.map((item) => (
                <Card
                  key={item.id}
                  className="overflow-hidden group hover:shadow-lg hover:scale-105 transition-all cursor-pointer"
                  onClick={() => setSelectedManga(item)}
                >
                  <div className="relative aspect-[2/3]">
                    <img
                      src={item.manga.coverImage || "/placeholder.png"}
                      alt={item.manga.title}
                      className="w-full h-full object-cover"
                    />

                    {/* Favorite Heart Overlay */}
                    {item.isFavorite && (
                      <div className="absolute top-1 right-1">
                        <Heart className="size-5 fill-red-500 text-red-500 drop-shadow-lg" />
                      </div>
                    )}

                    {/* Status Badge */}
                    <div className="absolute bottom-1 left-1">
                      <Badge
                        className={`${getStatusColor(item.status)} text-[10px] px-1 py-0`}
                      >
                        {t(`status.${item.status.toLowerCase()}`)}
                      </Badge>
                    </div>

                    {/* Rating */}
                    {item.rating && (
                      <div className="absolute bottom-1 right-1 bg-black/70 rounded px-1 flex items-center gap-0.5">
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
          )}
        </div>
      </div>

      {/* Manga Details Modal */}
      <Dialog
        open={!!selectedManga}
        onOpenChange={() => setSelectedManga(null)}
      >
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          {selectedManga && (
            <>
              <DialogHeader>
                <DialogTitle className="text-2xl">
                  {selectedManga.manga.title}
                </DialogTitle>
                <DialogDescription className="text-sm text-muted-foreground">
                  {selectedManga.manga.author}
                </DialogDescription>
              </DialogHeader>

              <div className="grid md:grid-cols-[200px_1fr] gap-6 items-start">
                {/* Cover Image */}
                <div className="flex justify-center">
                  <img
                    src={selectedManga.manga.coverImage || "/placeholder.png"}
                    alt={selectedManga.manga.title}
                    className="w-full max-w-[200px] rounded-lg shadow-lg"
                  />
                </div>

                {/* Details */}
                <div className="space-y-4">
                  {/* Status & Favorite */}
                  <div className="flex items-center gap-2">
                    <Badge className={getStatusColor(selectedManga.status)}>
                      {t(`status.${selectedManga.status.toLowerCase()}`)}
                    </Badge>
                    {selectedManga.isFavorite && (
                      <div className="flex items-center gap-1 text-red-500">
                        <Heart className="size-4 fill-current" />
                        <span className="text-sm font-medium">Favorito</span>
                      </div>
                    )}
                  </div>

                  {/* Rating */}
                  {selectedManga.rating && (
                    <div>
                      <p className="text-sm text-muted-foreground mb-1">
                        Avaliação
                      </p>
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
                        <span className="ml-2 font-semibold">
                          {formatRating(selectedManga.rating)}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Progress */}
                  {selectedManga.currentChapter && (
                    <div>
                      <p className="text-sm text-muted-foreground">Progresso</p>
                      <p className="font-medium">
                        Capítulo {selectedManga.currentChapter}
                        {selectedManga.manga.totalChapters &&
                          ` / ${selectedManga.manga.totalChapters}`}
                      </p>
                    </div>
                  )}

                  {/* Publication Status & Last Chapter */}
                  {(selectedManga.manga.publicationStatus ||
                    selectedManga.manga.lastChapter) && (
                    <div className="grid grid-cols-2 gap-4">
                      {selectedManga.manga.publicationStatus && (
                        <div>
                          <p className="text-sm text-muted-foreground mb-0.5">
                            Status
                          </p>
                          <Badge variant="secondary" className="text-xs">
                            {locale === "pt"
                              ? statusTranslations[
                                  selectedManga.manga.publicationStatus
                                ] || selectedManga.manga.publicationStatus
                              : selectedManga.manga.publicationStatus}
                          </Badge>
                        </div>
                      )}

                      {selectedManga.manga.lastChapter && (
                        <div>
                          <p className="text-sm text-muted-foreground mb-0.5">
                            {t("details.latestChapter")}
                          </p>
                          <p className="font-medium text-sm">
                            Cap. {selectedManga.manga.lastChapter}
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Genres */}
                  {selectedManga.manga.genres &&
                    selectedManga.manga.genres.length > 0 && (
                      <div>
                        <p className="text-sm text-muted-foreground mb-2">
                          Gêneros
                        </p>
                        <div className="flex flex-wrap gap-1">
                          {selectedManga.manga.genres.map((genre, i) => (
                            <Badge
                              key={i}
                              variant="outline"
                              className="text-xs"
                            >
                              {locale === "pt"
                                ? genreTranslations[genre] || genre
                                : genre}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}

                  {/* Date Added */}
                  <div className="pt-2 border-t mt-2">
                    <p className="text-sm text-muted-foreground mb-1">
                      {t("details.addedOn")}
                    </p>
                    <p className="font-medium">
                      {new Date(selectedManga.createdAt).toLocaleDateString(
                        locale === "pt" ? "pt-BR" : "en-US",
                      )}
                    </p>
                  </div>
                </div>
              </div>

              {/* User Notes */}
              {selectedManga.notes && (
                <div className="mt-6">
                  <p className="text-sm text-muted-foreground mb-2">
                    {t("details.notes")}
                  </p>
                  <div className="bg-muted/30 rounded-lg p-4 border italic text-sm leading-relaxed">
                    &ldquo;{selectedManga.notes}&rdquo;
                  </div>
                </div>
              )}

              {/* Description */}
              {(selectedManga.manga.descriptionPt ||
                selectedManga.manga.description) && (
                <div className="mt-4">
                  <p className="text-sm text-muted-foreground mb-2">Sinopse</p>
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
    </div>
  );
}

