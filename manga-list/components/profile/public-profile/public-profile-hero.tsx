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
    <>
      <div className="relative h-52 bg-gradient-to-r from-primary/20 to-primary/5 sm:h-64">
        {userData.user.bannerUrl && (
          <img
            src={userData.user.bannerUrl}
            alt={t("details.bannerAlt")}
            className="w-full h-full object-cover"
          />
        )}

        <div className="absolute -bottom-12 left-4 sm:-bottom-16 sm:left-8">
          <Avatar className="size-24 border-4 border-background sm:size-32">
            <AvatarImage src={userData.user.avatarUrl || undefined} />
            <AvatarFallback className="bg-primary/10 text-primary text-3xl">
              <User className="size-12 sm:size-16" />
            </AvatarFallback>
          </Avatar>
        </div>
      </div>

      <div className="container mx-auto mt-16 px-4 sm:mt-20">
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
                onClick={() => void onToggleLike()}
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

          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap gap-4">
              <div className="flex items-center gap-2">
                <BookOpen className="size-4 text-muted-foreground" />
                <span className="text-sm">
                  <strong>{userData.mangaList?.length || 0}</strong> {t("stats.total")}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Heart className="size-4 text-red-500 fill-red-500" />
                <span className="text-sm">
                  <strong>{userData.stats?.favorites || 0}</strong> {t("stats.favorites")}
                </span>
              </div>
            </div>
            {filtersToggleButton ? (
              <div className="self-start sm:self-auto">{filtersToggleButton}</div>
            ) : null}
          </div>
        </div>
      </div>
    </>
  );
}
