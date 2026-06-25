"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "@/i18n/routing";
import { useAuth } from "@/contexts/auth-context";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { ApiClientError, getApiErrorMessage } from "@/lib/api-client";
import {
  listMissingMangaCovers,
  listDuplicateMangaGroups,
  mergeDuplicateMangaGroup,
  repairMangaCover,
  repairMissingMangaCovers,
  updateMangaCoverManually,
  type MangaDuplicateItem,
  type MangaDuplicateGroup,
} from "@/lib/manga-admin-api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

const FALLBACK_COVER_IMAGE = "/logos/logo-icon-light.svg";

function normalizeCover(coverImage: string | null | undefined) {
  const normalized = String(coverImage || "").trim();
  if (!normalized) return FALLBACK_COVER_IMAGE;
  try {
    return new URL(normalized).toString();
  } catch {
    return FALLBACK_COVER_IMAGE;
  }
}

export default function MangaAdminPage() {
  const t = useTranslations("MangaAdmin");
  const router = useRouter();
  const { user, isLoading: isAuthLoading } = useAuth();

  const [groups, setGroups] = useState<MangaDuplicateGroup[]>([]);
  const [missingCoverItems, setMissingCoverItems] = useState<MangaDuplicateItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [canonicalByGroup, setCanonicalByGroup] = useState<Record<string, string>>({});
  const [isMergingByGroup, setIsMergingByGroup] = useState<Record<string, boolean>>({});
  const [isRepairingByManga, setIsRepairingByManga] = useState<Record<string, boolean>>({});
  const [manualCoverByManga, setManualCoverByManga] = useState<Record<string, string>>({});
  const [isSavingManualCoverByManga, setIsSavingManualCoverByManga] = useState<Record<string, boolean>>({});
  const [isRepairingMissingCovers, setIsRepairingMissingCovers] = useState(false);

  const handleForbidden = useCallback(() => {
    toast.error(t("messages.forbidden"));
    router.replace("/profile");
  }, [router, t]);

  const loadGroups = useCallback(async () => {
    setIsLoading(true);
    try {
      const [duplicatesData, missingCoversData] = await Promise.all([
        listDuplicateMangaGroups(30),
        listMissingMangaCovers(50),
      ]);
      setGroups(duplicatesData.groups || []);
      setMissingCoverItems(missingCoversData.items || []);
      setCanonicalByGroup((current) => {
        const next: Record<string, string> = { ...current };
        for (const group of duplicatesData.groups || []) {
          if (!next[group.normalizedTitle]) {
            next[group.normalizedTitle] = group.canonicalMangaId;
          }
        }
        return next;
      });
    } catch (error: unknown) {
      if (error instanceof ApiClientError && error.status === 403) {
        handleForbidden();
        return;
      }
      toast.error(getApiErrorMessage(error, t("messages.loadError")));
    } finally {
      setIsLoading(false);
    }
  }, [handleForbidden, t]);

  useEffect(() => {
    if (!isAuthLoading && !user) {
      router.push("/auth/login");
    }
  }, [isAuthLoading, router, user]);

  useEffect(() => {
    if (!user) return;
    void loadGroups();
  }, [loadGroups, user]);

  const totalCandidates = useMemo(
    () => groups.reduce((acc, group) => acc + group.items.length, 0),
    [groups],
  );

  const duplicateItemsWithoutCover = useMemo(
    () => missingCoverItems.length,
    [missingCoverItems],
  );

  if (isAuthLoading || !user) {
    return null;
  }

  const onMergeGroup = async (group: MangaDuplicateGroup) => {
    const canonicalMangaId =
      canonicalByGroup[group.normalizedTitle] || group.canonicalMangaId;
    const duplicateMangaIds = group.items
      .map((item) => item.id)
      .filter((id) => id !== canonicalMangaId);

    if (duplicateMangaIds.length === 0) {
      toast.info(t("messages.nothingToMerge"));
      return;
    }

    setIsMergingByGroup((prev) => ({ ...prev, [group.normalizedTitle]: true }));
    try {
      const result = await mergeDuplicateMangaGroup({
        canonicalMangaId,
        duplicateMangaIds,
      });
      toast.success(
        t("messages.mergeSuccess", {
          deleted: result.deletedMangas,
          moved: result.movedUserEntries + result.mergedUserEntries,
        }),
      );
      await loadGroups();
    } catch (error: unknown) {
      if (error instanceof ApiClientError && error.status === 403) {
        handleForbidden();
        return;
      }
      toast.error(getApiErrorMessage(error, t("messages.mergeError")));
    } finally {
      setIsMergingByGroup((prev) => ({ ...prev, [group.normalizedTitle]: false }));
    }
  };

  const onRepairCover = async (mangaId: string) => {
    setIsRepairingByManga((prev) => ({ ...prev, [mangaId]: true }));
    try {
      const result = await repairMangaCover(mangaId);
      if (result.changed) {
        toast.success(t("messages.repairCoverChanged", { source: result.source }));
      } else {
        toast.info(t("messages.repairCoverNoChange"));
      }
      await loadGroups();
    } catch (error: unknown) {
      if (error instanceof ApiClientError && error.status === 403) {
        handleForbidden();
        return;
      }
      toast.error(getApiErrorMessage(error, t("messages.repairCoverError")));
    } finally {
      setIsRepairingByManga((prev) => ({ ...prev, [mangaId]: false }));
    }
  };

  const onSaveManualCover = async (mangaId: string) => {
    const coverImage = (manualCoverByManga[mangaId] || "").trim();
    if (!coverImage) {
      toast.error(t("messages.manualCoverRequired"));
      return;
    }

    setIsSavingManualCoverByManga((prev) => ({ ...prev, [mangaId]: true }));
    try {
      await updateMangaCoverManually(mangaId, coverImage);
      toast.success(t("messages.manualCoverSuccess"));
      setManualCoverByManga((prev) => ({ ...prev, [mangaId]: "" }));
      await loadGroups();
    } catch (error: unknown) {
      if (error instanceof ApiClientError && error.status === 403) {
        handleForbidden();
        return;
      }
      toast.error(getApiErrorMessage(error, t("messages.manualCoverError")));
    } finally {
      setIsSavingManualCoverByManga((prev) => ({
        ...prev,
        [mangaId]: false,
      }));
    }
  };

  const onRepairMissingCovers = async () => {
    setIsRepairingMissingCovers(true);
    try {
      const result = await repairMissingMangaCovers(10);
      if (result.updated > 0) {
        toast.success(
          t("messages.repairMissingCoversSuccess", {
            updated: result.updated,
            unresolved: result.unresolved,
            total: result.total,
          }),
        );
      } else {
        toast.info(
          t("messages.repairMissingCoversNoChange", {
            unresolved: result.unresolved,
            total: result.total,
          }),
        );
      }
      await loadGroups();
    } catch (error: unknown) {
      if (error instanceof ApiClientError && error.status === 403) {
        handleForbidden();
        return;
      }
      toast.error(getApiErrorMessage(error, t("messages.repairMissingCoversError")));
    } finally {
      setIsRepairingMissingCovers(false);
    }
  };

  return (
    <div className="container mx-auto max-w-6xl px-4 py-8 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">{t("title")}</h1>
          <p className="text-muted-foreground mt-2">{t("subtitle")}</p>
        </div>
        <Button variant="outline" onClick={() => void loadGroups()} disabled={isLoading}>
          {isLoading ? t("actions.refreshing") : t("actions.refresh")}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("summary.title")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div className="flex flex-wrap gap-3">
            <Badge variant="secondary">
              {t("summary.groups", { count: groups.length })}
            </Badge>
            <Badge variant="secondary">
              {t("summary.items", { count: totalCandidates })}
            </Badge>
            <Badge variant="secondary">
              {t("summary.missingCovers", { count: duplicateItemsWithoutCover })}
            </Badge>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3">
            <p className="text-muted-foreground">
              {t("summary.repairMissingCoversDescription")}
            </p>
            <Button
              variant="outline"
              onClick={() => void onRepairMissingCovers()}
              disabled={isRepairingMissingCovers}
            >
              {isRepairingMissingCovers
                ? t("actions.repairingMissingCovers")
                : t("actions.repairMissingCovers")}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("missingCovers.title")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {missingCoverItems.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t("missingCovers.empty")}
            </p>
          ) : (
            missingCoverItems.map((item) => (
              <div
                key={item.id}
                className="rounded-md border p-3 flex flex-wrap items-center gap-3"
              >
                <img
                  src={FALLBACK_COVER_IMAGE}
                  alt={item.title}
                  className="h-16 w-11 rounded object-contain border p-2"
                />

                <div className="min-w-[200px] flex-1">
                  <p className="font-medium leading-tight">{item.title}</p>
                  <div className="mt-1 text-xs text-muted-foreground flex flex-wrap gap-2">
                    <span>MAL: {item.malId}</span>
                    <span>AniList: {item.anilistId ?? "n/a"}</span>
                    <span>{t("group.userEntries", { count: item.userEntries })}</span>
                    <span>{t("group.externalMaps", { count: item.externalMaps })}</span>
                  </div>
                </div>

                <div className="flex w-full flex-col gap-2 sm:w-auto sm:min-w-[360px]">
                  <div className="flex gap-2">
                    <Input
                      value={manualCoverByManga[item.id] || ""}
                      onChange={(event) =>
                        setManualCoverByManga((prev) => ({
                          ...prev,
                          [item.id]: event.target.value,
                        }))
                      }
                      placeholder={t("manualCover.placeholder")}
                      inputMode="url"
                      disabled={!!isSavingManualCoverByManga[item.id]}
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void onSaveManualCover(item.id)}
                      disabled={!!isSavingManualCoverByManga[item.id]}
                    >
                      {isSavingManualCoverByManga[item.id]
                        ? t("actions.savingManualCover")
                        : t("actions.saveManualCover")}
                    </Button>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void onRepairCover(item.id)}
                    disabled={!!isRepairingByManga[item.id]}
                  >
                    {isRepairingByManga[item.id]
                      ? t("actions.repairingCover")
                      : t("actions.repairCover")}
                  </Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {isLoading ? (
        <Card>
          <CardContent className="py-8 text-sm text-muted-foreground">
            {t("loading")}
          </CardContent>
        </Card>
      ) : groups.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-sm text-muted-foreground">
            {t("empty")}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {groups.map((group) => {
            const selectedCanonical =
              canonicalByGroup[group.normalizedTitle] || group.canonicalMangaId;
            return (
              <Card key={group.normalizedTitle}>
                <CardHeader className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <CardTitle className="text-lg">
                      {t("group.title", { normalizedTitle: group.normalizedTitle })}
                    </CardTitle>
                    <Button
                      onClick={() => void onMergeGroup(group)}
                      disabled={!!isMergingByGroup[group.normalizedTitle]}
                    >
                      {isMergingByGroup[group.normalizedTitle]
                        ? t("actions.merging")
                        : t("actions.mergeGroup")}
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs">
                    <Badge variant="outline">
                      {t("group.totalItems", { count: group.totalItems })}
                    </Badge>
                    <Badge variant="outline">
                      {t("group.totalRefs", { count: group.totalReferences })}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {group.items.map((item) => {
                    const isCanonical = selectedCanonical === item.id;
                    return (
                      <div
                        key={item.id}
                        className="rounded-md border p-3 flex flex-wrap items-center gap-3"
                      >
                        <input
                          type="radio"
                          name={`canonical-${group.normalizedTitle}`}
                          checked={isCanonical}
                          onChange={() =>
                            setCanonicalByGroup((prev) => ({
                              ...prev,
                              [group.normalizedTitle]: item.id,
                            }))
                          }
                          aria-label={t("group.selectCanonical")}
                        />

                        <img
                          src={normalizeCover(item.coverImage)}
                          alt={item.title}
                          referrerPolicy="no-referrer"
                          className="h-16 w-11 rounded object-cover border"
                          onError={(event) => {
                            event.currentTarget.src = FALLBACK_COVER_IMAGE;
                          }}
                        />

                        <div className="min-w-[200px] flex-1">
                          <p className="font-medium leading-tight">{item.title}</p>
                          <div className="mt-1 text-xs text-muted-foreground flex flex-wrap gap-2">
                            <span>MAL: {item.malId}</span>
                            <span>AniList: {item.anilistId ?? "n/a"}</span>
                            <span>{t("group.userEntries", { count: item.userEntries })}</span>
                            <span>{t("group.externalMaps", { count: item.externalMaps })}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          {isCanonical ? (
                            <Badge>{t("group.canonical")}</Badge>
                          ) : (
                            <Badge variant="secondary">{t("group.duplicate")}</Badge>
                          )}
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => void onRepairCover(item.id)}
                            disabled={!!isRepairingByManga[item.id]}
                          >
                            {isRepairingByManga[item.id]
                              ? t("actions.repairingCover")
                              : t("actions.repairCover")}
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
