"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { apiRequest, getApiErrorMessage } from "@/lib/api-client";
import type { MangaListItem, UserData } from "@/lib/public-profile-types";
import {
  GENRE_TRANSLATION_KEYS,
  copyTextToClipboard,
  getUsernameFromPathname,
} from "@/lib/public-profile-utils";

type TranslatorFn = (
  key: string,
  values?: Record<string, string | number | Date>,
) => string;

type AuthUserLike = {
  id: string;
  username: string;
  email: string;
} | null;

type UsePublicProfilePageParams = {
  pathname: string;
  locale: string;
  t: TranslatorFn;
  authUser: AuthUserLike;
  authLoading: boolean;
};

export function usePublicProfilePage({
  pathname,
  locale,
  t,
  authUser,
  authLoading,
}: UsePublicProfilePageParams) {
  const username = useMemo(() => getUsernameFromPathname(pathname), [pathname]);

  const statusTranslations: Record<string, string> = useMemo(
    () => ({
      Publishing: t("details.publicationStatusValues.publishing"),
      Finished: t("details.publicationStatusValues.finished"),
      "On Hiatus": t("details.publicationStatusValues.onHiatus"),
      Discontinued: t("details.publicationStatusValues.discontinued"),
      "Not yet aired": t("details.publicationStatusValues.notYetAired"),
    }),
    [t],
  );

  const [userData, setUserData] = useState<UserData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedManga, setSelectedManga] = useState<MangaListItem | null>(null);
  const [isLikeLoading, setIsLikeLoading] = useState(false);
  const [isLikedByMe, setIsLikedByMe] = useState(false);
  const [isOwnProfile, setIsOwnProfile] = useState(false);

  useEffect(() => {
    if (!username) {
      setError(t("messages.loadProfileError"));
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
        setError(getApiErrorMessage(err, t("messages.loadProfileError")));
      } finally {
        setIsLoading(false);
      }
    };

    void fetchUserData();
  }, [t, username]);

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

  const handleToggleLike = useCallback(async () => {
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
      toast.error(getApiErrorMessage(error, t("messages.toggleLikeError")));
    } finally {
      setIsLikeLoading(false);
    }
  }, [authUser, isOwnProfile, isLikeLoading, username, t]);

  const handleCopyMangaTitle = useCallback(
    async (title: string) => {
      try {
        await copyTextToClipboard(title);
        toast.success(t("messages.copyTitleSuccess"));
      } catch {
        toast.error(t("messages.copyTitleError"));
      }
    },
    [t],
  );

  const translateGenre = useCallback(
    (genre: string) => {
      if (locale !== "pt") return genre;
      const genreKey = GENRE_TRANSLATION_KEYS[genre];
      return genreKey ? t(`genres.${genreKey}`) : genre;
    },
    [locale, t],
  );

  return {
    username,
    userData,
    isLoading,
    error,
    selectedManga,
    isLikeLoading,
    isLikedByMe,
    isOwnProfile,
    statusTranslations,
    setSelectedManga,
    handleToggleLike,
    handleCopyMangaTitle,
    translateGenre,
  };
}

