"use client";

import { useEffect } from "react";

export function LangAndFontProvider({
  locale,
  fonts,
  children,
}: {
  locale: string;
  fonts: string;
  children: React.ReactNode;
}) {
  useEffect(() => {
    // Set the lang attribute on <html>
    document.documentElement.lang = locale;

    // Set font classes on <body>
    document.body.className = fonts;
  }, [locale, fonts]);

  return <>{children}</>;
}
