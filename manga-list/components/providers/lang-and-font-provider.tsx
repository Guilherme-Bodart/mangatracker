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

    // Merge font classes into <body> without overwriting existing classes (e.g. theme classes)
    const fontClasses = fonts.split(" ").filter(Boolean);
    document.body.classList.add(...fontClasses);

    return () => {
      document.body.classList.remove(...fontClasses);
    };
  }, [locale, fonts]);

  return <>{children}</>;
}
