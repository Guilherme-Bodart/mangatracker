"use client";

import { Link } from "@/i18n/routing";
import { useTranslations, useLocale } from "next-intl";
import { usePathname, useRouter } from "@/i18n/routing";
import { Button } from "@/components/ui/button";
import { Languages } from "lucide-react";

export function Footer() {
  const t = useTranslations("Footer");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();

  const switchLanguage = (newLocale: string) => {
    router.replace(pathname, { locale: newLocale });
  };

  return (
    <footer className="border-t py-6 md:py-0">
      <div className="container mx-auto flex flex-col items-center justify-between gap-4 px-4 md:h-24 md:flex-row">
        {/* Copyright */}
        <div className="flex items-center gap-3">
          <img
            src="/logos/logo-icon-light.svg"
            alt="Manga Tracker"
            className="size-8 rounded-md dark:hidden"
          />
          <img
            src="/logos/logo-icon-dark.svg"
            alt="Manga Tracker"
            className="hidden size-8 rounded-md dark:block"
          />
          <p className="text-center text-sm leading-loose text-muted-foreground md:text-left">
            © {new Date().getFullYear()} Manga Tracker. {t("copyright")}
          </p>
        </div>

        {/* Links + Language Switcher */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          {/* Nav Links */}
          <div className="flex items-center justify-center gap-4">
            <Link
              href="/terms"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              {t("terms")}
            </Link>
            <Link
              href="/privacy"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              {t("privacy")}
            </Link>
            <Link
              href="/contact"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              {t("contact")}
            </Link>
            <Link
              href="/how-to-use-api"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              {t("howToUseApi")}
            </Link>
          </div>

          {/* Language Switcher */}
          <div className="flex items-center justify-center gap-2 border-l pl-4">
            <Languages className="size-4 text-muted-foreground" />
            <div className="flex gap-1">
              <Button
                variant={locale === "pt" ? "default" : "ghost"}
                size="sm"
                onClick={() => switchLanguage("pt")}
                className="h-8 text-xs"
              >
                PT
              </Button>
              <Button
                variant={locale === "en" ? "default" : "ghost"}
                size="sm"
                onClick={() => switchLanguage("en")}
                className="h-8 text-xs"
              >
                EN
              </Button>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
