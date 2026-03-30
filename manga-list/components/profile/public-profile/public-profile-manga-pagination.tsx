"use client";

import { Button } from "@/components/ui/button";

type TranslatorFn = (
  key: string,
  values?: Record<string, string | number | Date>,
) => string;

type PublicProfileMangaPaginationProps = {
  t: TranslatorFn;
  currentPage: number;
  totalPages: number;
  align?: "right" | "center";
  onPageChange: (page: number) => void;
};

export function PublicProfileMangaPagination({
  t,
  currentPage,
  totalPages,
  align = "right",
  onPageChange,
}: PublicProfileMangaPaginationProps) {
  const justifyClass = align === "center" ? "justify-center" : "justify-end";

  return (
    <div className={`flex items-center gap-2 ${justifyClass}`}>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage <= 1}
      >
        {t("controls.previousPage")}
      </Button>
      <span className="min-w-24 text-center text-sm text-muted-foreground">
        {t("controls.pageLabel", { page: currentPage, total: totalPages })}
      </span>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage >= totalPages}
      >
        {t("controls.nextPage")}
      </Button>
    </div>
  );
}
