import type { ReactNode } from "react";
import { AdsterraMediumRectangle } from "@/components/ads/adsterra-medium-rectangle";
import { cn } from "@/lib/utils";

type AdsterraDesktopSideRailsLayoutProps = {
  children: ReactNode;
  className?: string;
};

export function AdsterraDesktopSideRailsLayout({
  children,
  className,
}: AdsterraDesktopSideRailsLayoutProps) {
  return (
    <div
      className={cn(
        "mx-auto w-full min-[1700px]:grid min-[1700px]:max-w-[1880px] min-[1700px]:grid-cols-[300px_minmax(0,1fr)_300px] min-[1700px]:gap-8",
        className,
      )}
    >
      <aside className="hidden min-[1700px]:block">
        <div className="sticky top-24 space-y-6">
          <AdsterraMediumRectangle />
          <AdsterraMediumRectangle />
        </div>
      </aside>

      <div className="min-w-0">{children}</div>

      <aside className="hidden min-[1700px]:block">
        <div className="sticky top-24 space-y-6">
          <AdsterraMediumRectangle />
          <AdsterraMediumRectangle />
        </div>
      </aside>
    </div>
  );
}
