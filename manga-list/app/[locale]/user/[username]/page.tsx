"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/auth-context";
import { useLocale, useTranslations } from "next-intl";
import { usePathname } from "@/i18n/routing";
import { Filter, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePublicProfilePage } from "@/hooks/use-public-profile-page";
import { PublicProfileHero } from "@/components/profile/public-profile/public-profile-hero";
import { PublicProfileMangaControls } from "@/components/profile/public-profile/public-profile-manga-controls";
import { PublicProfileMangaGrid } from "@/components/profile/public-profile/public-profile-manga-grid";
import { PublicProfileMangaPagination } from "@/components/profile/public-profile/public-profile-manga-pagination";
import { PublicProfileMangaDetailsDialog } from "@/components/profile/public-profile/public-profile-manga-details-dialog";
import { apiRequest } from "@/lib/api-client";

type UserMangaEntry = {
  manga: {
    malId: number;
  };
};

export default function PublicProfilePage() {
  const pathname = usePathname();
  const t = useTranslations("PublicProfile");
  const locale = useLocale();
  const { user: authUser, isLoading: authLoading } = useAuth();
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  const [userMangaMalIds, setUserMangaMalIds] = useState<Set<number>>(
    () => new Set(),
  );

  const {
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
    searchInput,
    sortBy,
    sortDirection,
    pageSize,
    currentPage,
    totalPages,
    totalFilteredItems,
    paginatedMangaList,
    pageSizeOptions,
    setSearchInput,
    setSortBy,
    setSortDirection,
    setCurrentPage,
    handlePageSizeChange,
  } = usePublicProfilePage({
    pathname,
    locale,
    t,
    authUser,
    authLoading,
  });

  useEffect(() => {
    const loadUserMangaMalIds = async () => {
      if (!authUser || isOwnProfile) {
        setUserMangaMalIds(new Set());
        return;
      }

      try {
        const data = await apiRequest<UserMangaEntry[]>("/manga/list");
        setUserMangaMalIds(new Set(data.map((entry) => entry.manga.malId)));
      } catch {
        // Keep public profile usable even if the personal list fetch fails.
      }
    };

    void loadUserMangaMalIds();
  }, [authUser, isOwnProfile]);

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
    <div className="min-h-screen overflow-x-hidden pb-8">
      <PublicProfileHero
        t={t}
        userData={userData}
        authLoading={authLoading}
        authUser={authUser}
        isOwnProfile={isOwnProfile}
        isLikedByMe={isLikedByMe}
        isLikeLoading={isLikeLoading}
        onToggleLike={handleToggleLike}
        filtersToggleButton={
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="cursor-pointer"
            onClick={() => setIsFiltersOpen((prev) => !prev)}
            aria-label={
              isFiltersOpen
                ? t("controls.hideFiltersAria")
                : t("controls.showFiltersAria")
            }
          >
            <Filter className="size-4" />
          </Button>
        }
      />

      <div className="pb-8">
        <div className="container mx-auto space-y-4 px-4">
          {isFiltersOpen ? (
            <PublicProfileMangaControls
              t={t}
              searchInput={searchInput}
              sortBy={sortBy}
              sortDirection={sortDirection}
              pageSize={pageSize}
              totalFilteredItems={totalFilteredItems}
              pageSizeOptions={pageSizeOptions}
              onSearchChange={setSearchInput}
              onSortByChange={setSortBy}
              onSortDirectionChange={setSortDirection}
              onPageSizeChange={handlePageSizeChange}
            />
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-2xl font-bold">{t("mangaList")}</h2>
            <PublicProfileMangaPagination
              t={t}
              currentPage={currentPage}
              totalPages={totalPages}
              align="right"
              onPageChange={setCurrentPage}
            />
          </div>

          <PublicProfileMangaGrid
            t={t}
            mangaList={paginatedMangaList}
            hasAnyManga={userData.mangaList.length > 0}
            canAddToOwnList={!!authUser && !isOwnProfile}
            userMangaMalIds={userMangaMalIds}
            onSelectManga={setSelectedManga}
            onAddedToOwnList={(malId) => {
              setUserMangaMalIds((prev) => {
                const next = new Set(prev);
                next.add(malId);
                return next;
              });
            }}
            onCopyMangaTitle={handleCopyMangaTitle}
          />

          <PublicProfileMangaPagination
            t={t}
            currentPage={currentPage}
            totalPages={totalPages}
            align="center"
            onPageChange={setCurrentPage}
          />
        </div>
      </div>

      <PublicProfileMangaDetailsDialog
        t={t}
        locale={locale}
        selectedManga={selectedManga}
        canAddToOwnList={!!authUser && !isOwnProfile}
        userMangaMalIds={userMangaMalIds}
        statusTranslations={statusTranslations}
        translateGenre={translateGenre}
        onAddedToOwnList={(malId) => {
          setUserMangaMalIds((prev) => {
            const next = new Set(prev);
            next.add(malId);
            return next;
          });
        }}
        onOpenChange={() => setSelectedManga(null)}
      />
    </div>
  );
}
