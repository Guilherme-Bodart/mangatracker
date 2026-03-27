"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import type { UserData } from "@/lib/public-profile-types";
import { BookOpen, Heart, User } from "lucide-react";
import { Link } from "@/i18n/routing";

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
}: PublicProfileHeroProps) {
  return (
    <>
      <div className="relative h-64 bg-gradient-to-r from-primary/20 to-primary/5">
        {userData.user.bannerUrl && (
          <img
            src={userData.user.bannerUrl}
            alt={t("details.bannerAlt")}
            className="w-full h-full object-cover"
          />
        )}

        <div className="absolute -bottom-16 left-8">
          <Avatar className="size-32 border-4 border-background">
            <AvatarImage src={userData.user.avatarUrl || undefined} />
            <AvatarFallback className="bg-primary/10 text-primary text-3xl">
              <User className="size-16" />
            </AvatarFallback>
          </Avatar>
        </div>
      </div>

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

          <div className="flex flex-wrap gap-4 mt-4">
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
        </div>
      </div>
    </>
  );
}

