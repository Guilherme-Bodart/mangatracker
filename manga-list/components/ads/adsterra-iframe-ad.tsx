"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";

type AdsterraIframeAdProps = {
  adKey: string;
  width: number;
  height: number;
  className?: string;
};

const ADSTERRA_IFRAME_SCRIPT_BASE_URL = "https://www.highperformanceformat.com";

export function AdsterraIframeAd({
  adKey,
  width,
  height,
  className,
}: AdsterraIframeAdProps) {
  const srcDoc = useMemo(
    () => `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      html, body {
        margin: 0;
        padding: 0;
        width: 100%;
        height: 100%;
        overflow: hidden;
        background: transparent;
      }
      body {
        display: flex;
        align-items: center;
        justify-content: center;
      }
    </style>
  </head>
  <body>
    <script>
      atOptions = ${JSON.stringify({
        key: adKey,
        format: "iframe",
        height,
        width,
        params: {},
      })};
    </script>
    <script src="${ADSTERRA_IFRAME_SCRIPT_BASE_URL}/${adKey}/invoke.js"></script>
  </body>
</html>`,
    [adKey, height, width],
  );

  return (
    <div className={cn("w-full overflow-hidden", className)}>
      <div className="flex justify-center">
        <iframe
          title={`Adsterra ad ${adKey}`}
          srcDoc={srcDoc}
          width={width}
          height={height}
          scrolling="no"
          className="block border-0 bg-transparent"
        />
      </div>
    </div>
  );
}
