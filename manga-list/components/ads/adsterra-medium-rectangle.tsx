"use client";

import { AdsterraIframeAd } from "@/components/ads/adsterra-iframe-ad";

type AdsterraMediumRectangleProps = {
  className?: string;
};

export function AdsterraMediumRectangle({
  className,
}: AdsterraMediumRectangleProps) {
  return (
    <AdsterraIframeAd
      adKey="cdfb6cf08f66308264b82503d07a332d"
      width={300}
      height={250}
      className={className}
    />
  );
}
