"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import type { UserData } from "@/lib/public-profile-types";
import { BookOpen, Heart, User } from "lucide-react";
import { Link } from "@/i18n/routing";
import type { ReactNode } from "react";

type TranslatorFn = (
  key: string,
  values?: Record<string, string | number | Date>,
) => string;

type PublicProfileHeroProps = {
  t: TranslatorFn;
  userData: UserData;
  authLoading: boolean;
  authUser: { id: string } | null;
  isOwnProfile: boolean;
  isLikedByMe: boolean;
  isLikeLoading: boolean;
  onToggleLike: () => Promise<void>;
  filtersToggleButton?: ReactNode;
};

export function PublicProfileHero({
  t,
  userData,
  authLoading,
  authUser,
  isOwnProfile,
  isLikedByMe,
  isLikeLoading,
  onToggleLike,
  filtersToggleButton,
}: PublicProfileHeroProps) {
  return (
    <div className="relative mb-6 overflow-hidden bg-gradient-to-r from-primary/20 to-primary/5">
      {userData.user.bannerUrl ? (
        <img
          src={userData.user.bannerUrl}
          alt={t("details.bannerAlt")}
          className="block h-52 w-full object-cover sm:h-64 md:h-auto md:max-h-[50vh]"
        />
      ) : (
        <div className="h-52 w-full bg-gradient-to-r from-primary/20 to-primary/5 sm:h-64 md:h-[50vh] md:max-h-[50vh]" />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-background via-background/70 to-background/20" />

      <div className="absolute inset-x-0 bottom-0">
        <div className="container mx-auto px-4 pb-4 sm:px-6 sm:pb-6 lg:px-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex items-end gap-4">
              <Avatar className="size-20 border-4 border-background shadow-lg sm:size-24">
                <AvatarImage src={userData.user.avatarUrl || undefined} />
                <AvatarFallback className="bg-primary/10 text-primary text-3xl">
                  <User className="size-10 sm:size-12" />
                </AvatarFallback>
              </Avatar>

              <div className="pb-1">
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
                      onClick={() => void onToggleLike()}
                      disabled={isLikeLoading}
                      className="gap-2"
                    >
                      <Heart className={`size-4 ${isLikedByMe ? "fill-current" : ""}`} />
                      {isLikedByMe ? t("unlikeProfile") : t("likeProfile")}
                    </Button>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-3 text-sm">
                  <div className="flex items-center gap-1 text-muted-foreground">
                    <Heart className="size-4 text-red-500" />
                    <strong className="text-foreground">{userData.user.totalLikes}</strong>
                    <span>{t("likes")}</span>
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <BookOpen className="size-4" />
                    <span>
                      <strong className="text-foreground">
                        {userData.mangaList?.length || 0}
                      </strong>{" "}
                      {t("stats.total")}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Heart className="size-4 fill-red-500 text-red-500" />
                    <span>
                      <strong className="text-foreground">
                        {userData.stats?.favorites || 0}
                      </strong>{" "}
                      {t("stats.favorites")}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {filtersToggleButton ? (
              <div className="self-start pb-1 sm:self-auto">{filtersToggleButton}</div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
