"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

declare global {
  interface Window {
    atOptions?: unknown;
  }
}

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
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    host.innerHTML = "";

    const optionsScript = document.createElement("script");
    optionsScript.type = "text/javascript";
    optionsScript.text = `atOptions = ${JSON.stringify({
      key: adKey,
      format: "iframe",
      height,
      width,
      params: {},
    })};`;

    const invokeScript = document.createElement("script");
    invokeScript.type = "text/javascript";
    invokeScript.async = false;
    invokeScript.src = `${ADSTERRA_IFRAME_SCRIPT_BASE_URL}/${adKey}/invoke.js`;

    host.append(optionsScript, invokeScript);

    return () => {
      host.innerHTML = "";
      delete window.atOptions;
    };
  }, [adKey, height, width]);

  return (
    <div className={cn("w-full overflow-hidden", className)}>
      <div
        ref={hostRef}
        className="flex justify-center"
        style={{ minHeight: `${height}px` }}
      />
    </div>
  );
}
