"use client";

import { useEffect, useState } from "react";
import { AdsterraIframeAd } from "@/components/ads/adsterra-iframe-ad";
import { cn } from "@/lib/utils";

type AdsterraResponsiveBannerProps = {
  className?: string;
};

export function AdsterraResponsiveBanner({
  className,
}: AdsterraResponsiveBannerProps) {
  const [isDesktop, setIsDesktop] = useState<boolean | null>(null);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(min-width: 768px)");
    const updateViewport = () => setIsDesktop(mediaQuery.matches);

    updateViewport();
    mediaQuery.addEventListener("change", updateViewport);

    return () => {
      mediaQuery.removeEventListener("change", updateViewport);
    };
  }, []);

  if (isDesktop === null) {
    return (
      <div
        className={cn("w-full overflow-hidden", className)}
        style={{ minHeight: "50px" }}
      />
    );
  }

  return isDesktop ? (
    <AdsterraIframeAd
      adKey="9193fce2c3717ab0696852d3e9a64a61"
      width={728}
      height={90}
      className={className}
    />
  ) : (
    <AdsterraIframeAd
      adKey="3927fd6440b33c48d7f86cf456d34750"
      width={320}
      height={50}
      className={className}
    />
  );
}
