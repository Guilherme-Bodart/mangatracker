"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getApiUrl } from "@/lib/api-config";
import { logger } from "@/lib/logger";

type TrendingManga = {
  mal_id: number;
  title: string;
  images: {
    jpg: {
      large_image_url: string;
    };
  };
};

type TopMangaResponse = {
  data?: TrendingManga[];
};

type TrendingCache = {
  cachedAt: number;
  data: TrendingManga[];
};

const CACHE_KEY = "mt:home:trending-manga:v1";
const CACHE_TTL_MS = 60 * 60 * 1000;

let inFlightTrendingRequest: Promise<TrendingManga[]> | null = null;

function readCachedTrending(nowMs = Date.now()): TrendingManga[] | null {
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as Partial<TrendingCache>;
    if (
      !Array.isArray(parsed.data) ||
      typeof parsed.cachedAt !== "number" ||
      nowMs - parsed.cachedAt > CACHE_TTL_MS
    ) {
      return null;
    }

    return parsed.data;
  } catch {
    return null;
  }
}

function writeCachedTrending(data: TrendingManga[]) {
  try {
    window.localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({ cachedAt: Date.now(), data }),
    );
  } catch {
    // Ignore private-mode/quota failures; the page still works without cache.
  }
}

async function fetchTrendingManga(): Promise<TrendingManga[]> {
  const response = await fetch(getApiUrl("/manga/top?page=1"));
  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`);
  }

  const data = (await response.json()) as TopMangaResponse;
  return data.data?.slice(0, 6) ?? [];
}

async function getTrendingManga(): Promise<TrendingManga[]> {
  const cached = readCachedTrending();
  if (cached) {
    return cached;
  }

  inFlightTrendingRequest ??= fetchTrendingManga().finally(() => {
    inFlightTrendingRequest = null;
  });

  const data = await inFlightTrendingRequest;
  writeCachedTrending(data);
  return data;
}

export function TrendingMangaSection() {
  const t = useTranslations("Home");
  const [trendingManga, setTrendingManga] = useState<TrendingManga[]>([]);

  useEffect(() => {
    let isMounted = true;

    void getTrendingManga()
      .then((data) => {
        if (isMounted) {
          setTrendingManga(data);
        }
      })
      .catch((error) => {
        logger.error("Error fetching trending manga:", error);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  if (trendingManga.length === 0) {
    return null;
  }

  return (
    <section className="py-16 px-4">
      <div className="container mx-auto">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h2 className="mb-2 text-3xl font-bold">
              {t("trending.title")}
            </h2>
            <p className="text-muted-foreground">
              {t("trending.subtitle")}
            </p>
          </div>
          <Button asChild variant="outline">
            <Link href="/manga">{t("trending.viewAll")}</Link>
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {trendingManga.map((manga) => (
            <Card
              key={manga.mal_id}
              className="overflow-hidden transition-shadow hover:shadow-lg"
            >
              <div className="relative aspect-[2/3] overflow-hidden">
                <img
                  src={manga.images.jpg.large_image_url}
                  alt={manga.title}
                  className="h-full w-full object-cover transition-transform hover:scale-105"
                />
              </div>
              <CardContent className="p-3">
                <h3 className="line-clamp-2 text-sm font-semibold">
                  {manga.title}
                </h3>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
