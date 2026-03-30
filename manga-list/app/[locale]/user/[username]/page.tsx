"use client";

import { useAuth } from "@/contexts/auth-context";
import { useLocale, useTranslations } from "next-intl";
import { usePathname } from "@/i18n/routing";
import { User } from "lucide-react";
import { usePublicProfilePage } from "@/hooks/use-public-profile-page";
import { PublicProfileHero } from "@/components/profile/public-profile/public-profile-hero";
import { PublicProfileMangaControls } from "@/components/profile/public-profile/public-profile-manga-controls";
import { PublicProfileMangaGrid } from "@/components/profile/public-profile/public-profile-manga-grid";
import { PublicProfileMangaDetailsDialog } from "@/components/profile/public-profile/public-profile-manga-details-dialog";

export default function PublicProfilePage() {
  const pathname = usePathname();
  const t = useTranslations("PublicProfile");
  const locale = useLocale();
  const { user: authUser, isLoading: authLoading } = useAuth();

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
      <PublicProfileHero
        t={t}
        userData={userData}
        authLoading={authLoading}
        authUser={authUser}
        isOwnProfile={isOwnProfile}
        isLikedByMe={isLikedByMe}
        isLikeLoading={isLikeLoading}
        onToggleLike={handleToggleLike}
      />

      <div className="container mx-auto px-4 space-y-4">
        <PublicProfileMangaControls
          t={t}
          searchInput={searchInput}
          sortBy={sortBy}
          sortDirection={sortDirection}
          pageSize={pageSize}
          currentPage={currentPage}
          totalPages={totalPages}
          totalFilteredItems={totalFilteredItems}
          pageSizeOptions={pageSizeOptions}
          onSearchChange={setSearchInput}
          onSortByChange={setSortBy}
          onSortDirectionChange={setSortDirection}
          onPageSizeChange={handlePageSizeChange}
          onPageChange={setCurrentPage}
        />

        <PublicProfileMangaGrid
          t={t}
          mangaList={paginatedMangaList}
          hasAnyManga={userData.mangaList.length > 0}
          onSelectManga={setSelectedManga}
          onCopyMangaTitle={handleCopyMangaTitle}
        />
      </div>

      <PublicProfileMangaDetailsDialog
        t={t}
        locale={locale}
        selectedManga={selectedManga}
        statusTranslations={statusTranslations}
        translateGenre={translateGenre}
        onOpenChange={() => setSelectedManga(null)}
      />
    </div>
  );
}
