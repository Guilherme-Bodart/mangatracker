"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/auth-context";

export function HomeSignedOutCta() {
  const t = useTranslations("Home");
  const { user, isLoading } = useAuth();

  if (isLoading || user) {
    return null;
  }

  return (
    <section className="px-4 py-20">
      <div className="container mx-auto max-w-3xl text-center">
        <h2 className="mb-4 text-3xl font-bold md:text-4xl">
          {t("cta.title")}
        </h2>
        <p className="mb-8 text-xl text-muted-foreground">
          {t("cta.subtitle")}
        </p>
        <Button asChild size="lg" className="px-8 py-6 text-lg">
          <Link href="/auth/register">{t("cta.button")}</Link>
        </Button>
      </div>
    </section>
  );
}
