import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/routing";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { BookOpen, Share2, Compass } from "lucide-react";
import { HomeSignedOutCta } from "@/components/home/home-signed-out-cta";
import { TrendingMangaSection } from "@/components/home/trending-manga-section";
import { routing } from "@/i18n/routing";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Home");

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

      <div>
        <TrendingMangaSection />

        {/* Features */}
        <section className="bg-transparent px-4 py-16">
          <div className="container mx-auto max-w-6xl">
            <h2 className="mb-12 text-center text-3xl font-bold">
              {t("features.title")}
            </h2>

            <div className="grid gap-8 md:grid-cols-3">
              <Card className="border-2 transition-colors hover:border-primary/50">
                <CardContent className="pt-6 text-center">
                  <div className="mb-4 flex justify-center">
                    <div className="rounded-full bg-primary/10 p-3">
                      <BookOpen className="size-10 text-primary" />
                    </div>
                  </div>
                  <h3 className="mb-3 text-xl font-bold">
                    {t("features.track.title")}
                  </h3>
                  <p className="text-muted-foreground">
                    {t("features.track.description")}
                  </p>
                </CardContent>
              </Card>

              <Card className="border-2 transition-colors hover:border-primary/50">
                <CardContent className="pt-6 text-center">
                  <div className="mb-4 flex justify-center">
                    <div className="rounded-full bg-primary/10 p-3">
                      <Share2 className="size-10 text-primary" />
                    </div>
                  </div>
                  <h3 className="mb-3 text-xl font-bold">
                    {t("features.share.title")}
                  </h3>
                  <p className="text-muted-foreground">
                    {t("features.share.description")}
                  </p>
                </CardContent>
              </Card>

              <Card className="border-2 transition-colors hover:border-primary/50">
                <CardContent className="pt-6 text-center">
                  <div className="mb-4 flex justify-center">
                    <div className="rounded-full bg-primary/10 p-3">
                      <Compass className="size-10 text-primary" />
                    </div>
                  </div>
                  <h3 className="mb-3 text-xl font-bold">
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

        <HomeSignedOutCta />
      </div>
    </div>
  );
}
