"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

type AdsterraNativeBannerProps = {
  className?: string;
};

const ADSTERRA_NATIVE_CONTAINER_ID = "container-32c1096bd677e1caac3cf5ced8d8fca3";
const ADSTERRA_NATIVE_SCRIPT_SRC =
  "https://pl29044555.profitablecpmratenetwork.com/32c1096bd677e1caac3cf5ced8d8fca3/invoke.js";

export function AdsterraNativeBanner({
  className,
}: AdsterraNativeBannerProps) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    host.innerHTML = "";

    const container = document.createElement("div");
    container.id = ADSTERRA_NATIVE_CONTAINER_ID;

    const script = document.createElement("script");
    script.async = true;
    script.setAttribute("data-cfasync", "false");
    script.src = ADSTERRA_NATIVE_SCRIPT_SRC;

    host.append(container, script);

    return () => {
      host.innerHTML = "";
    };
  }, []);

  return <div ref={hostRef} className={cn("w-full overflow-hidden", className)} />;
}
