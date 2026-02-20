import { getTranslations } from "next-intl/server";
import { cookies } from "next/headers";
import { Link } from "@/i18n/routing";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { apiRequest, getApiErrorMessage } from "@/lib/api-client";
import { logger } from "@/lib/logger";
import { BookOpen, Share2, Compass } from "lucide-react";

interface TrendingManga {
  mal_id: number;
  title: string;
  images: {
    jpg: {
      large_image_url: string;
    };
  };
}

type TopMangaResponse = {
  data?: TrendingManga[];
};

async function getTrendingManga() {
  try {
    const data = await apiRequest<TopMangaResponse>("/manga/top?page=1", {
      cache: "no-store",
    });
    return data.data?.slice(0, 6) || [];
  } catch (error) {
    logger.error(
      "Error fetching trending manga:",
      getApiErrorMessage(error, "Request failed"),
    );
    return [];
  }
}

export default async function HomePage() {
  const t = await getTranslations("Home");
  const cookieStore = await cookies();
  const isLoggedIn =
    !!cookieStore.get("auth_token")?.value ||
    !!cookieStore.get("csrf_session")?.value;
  const trendingManga = await getTrendingManga();

  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <section className="relative py-20 px-4 bg-gradient-to-b from-primary/10 to-background">
        <div className="container mx-auto text-center max-w-4xl">
          <h1 className="inline-block pb-2 text-4xl md:text-6xl font-bold leading-[1.15] mb-6 bg-clip-text text-transparent bg-gradient-to-r from-primary to-primary/60">
            {t("hero.title")}
          </h1>
          <p className="text-xl md:text-2xl text-muted-foreground mb-8">
            {t("hero.subtitle")}
          </p>
          <Button asChild size="lg" className="text-lg px-8 py-6">
            <Link href="/auth/register">{t("hero.cta")}</Link>
          </Button>
        </div>
      </section>

      {/* Trending Manga */}
      {trendingManga.length > 0 && (
        <section className="py-16 px-4">
          <div className="container mx-auto">
            <div className="flex justify-between items-center mb-8">
              <div>
                <h2 className="text-3xl font-bold mb-2">
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

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
              {trendingManga.map((manga: TrendingManga) => (
                <Card
                  key={manga.mal_id}
                  className="overflow-hidden hover:shadow-lg transition-shadow"
                >
                  <div className="aspect-[2/3] relative overflow-hidden">
                    <img
                      src={manga.images.jpg.large_image_url}
                      alt={manga.title}
                      className="object-cover w-full h-full hover:scale-105 transition-transform"
                    />
                  </div>
                  <CardContent className="p-3">
                    <h3 className="font-semibold text-sm line-clamp-2">
                      {manga.title}
                    </h3>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Features */}
      <section className="py-16 px-4 bg-muted/50">
        <div className="container mx-auto max-w-6xl">
          <h2 className="text-3xl font-bold text-center mb-12">
            {t("features.title")}
          </h2>

          <div className="grid md:grid-cols-3 gap-8">
            {/* Track */}
            <Card className="border-2 hover:border-primary/50 transition-colors">
              <CardContent className="pt-6 text-center">
                <div className="mb-4 flex justify-center">
                  <div className="p-3 bg-primary/10 rounded-full">
                    <BookOpen className="size-10 text-primary" />
                  </div>
                </div>
                <h3 className="text-xl font-bold mb-3">
                  {t("features.track.title")}
                </h3>
                <p className="text-muted-foreground">
                  {t("features.track.description")}
                </p>
              </CardContent>
            </Card>

            {/* Share */}
            <Card className="border-2 hover:border-primary/50 transition-colors">
              <CardContent className="pt-6 text-center">
                <div className="mb-4 flex justify-center">
                  <div className="p-3 bg-primary/10 rounded-full">
                    <Share2 className="size-10 text-primary" />
                  </div>
                </div>
                <h3 className="text-xl font-bold mb-3">
                  {t("features.share.title")}
                </h3>
                <p className="text-muted-foreground">
                  {t("features.share.description")}
                </p>
              </CardContent>
            </Card>

            {/* Discover */}
            <Card className="border-2 hover:border-primary/50 transition-colors">
              <CardContent className="pt-6 text-center">
                <div className="mb-4 flex justify-center">
                  <div className="p-3 bg-primary/10 rounded-full">
                    <Compass className="size-10 text-primary" />
                  </div>
                </div>
                <h3 className="text-xl font-bold mb-3">
                  {t("features.discover.title")}
                </h3>
                <p className="text-muted-foreground">
                  {t("features.discover.description")}
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      {!isLoggedIn && (
        <section className="py-20 px-4">
          <div className="container mx-auto text-center max-w-3xl">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              {t("cta.title")}
            </h2>
            <p className="text-xl text-muted-foreground mb-8">
              {t("cta.subtitle")}
            </p>
            <Button asChild size="lg" className="text-lg px-8 py-6">
              <Link href="/auth/register">{t("cta.button")}</Link>
            </Button>
          </div>
        </section>
      )}
    </div>
  );
}
