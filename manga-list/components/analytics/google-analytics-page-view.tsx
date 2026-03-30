"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
    __mtGaLastPagePath?: string;
  }
}

type GoogleAnalyticsPageViewProps = {
  measurementId: string;
};

const PAGE_VIEW_RETRY_DELAY_MS = 250;
const PAGE_VIEW_MAX_RETRIES = 20;

export function GoogleAnalyticsPageView({
  measurementId,
}: GoogleAnalyticsPageViewProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryString = searchParams?.toString() ?? "";

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const basePath = pathname || "/";
    const pagePath = queryString ? `${basePath}?${queryString}` : basePath;

    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const sendPageView = (attempt: number) => {
      if (cancelled) {
        return;
      }

      if (typeof window.gtag === "function") {
        if (window.__mtGaLastPagePath === pagePath) {
          return;
        }

        window.gtag("event", "page_view", {
          page_path: pagePath,
          page_location: window.location.origin + pagePath,
          page_title: document.title,
          send_to: measurementId,
        });
        window.__mtGaLastPagePath = pagePath;
        return;
      }

      if (attempt >= PAGE_VIEW_MAX_RETRIES) {
        return;
      }

      timeoutId = setTimeout(() => {
        sendPageView(attempt + 1);
      }, PAGE_VIEW_RETRY_DELAY_MS);
    };

    sendPageView(0);

    return () => {
      cancelled = true;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [measurementId, pathname, queryString]);

  return null;
}
