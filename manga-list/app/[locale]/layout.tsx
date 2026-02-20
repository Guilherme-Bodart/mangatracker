import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "../globals.css";
import { Header } from "@/components/layouts/header";
import { Footer } from "@/components/layouts/footer";
import { getMessages } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { LangAndFontProvider } from "@/components/providers/lang-and-font-provider";
import { Providers } from "@/components/providers/providers";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Manga Tracker",
  description: "Manga Tracker is a web application that allows you to keep track of the manga you are reading, want to read, or have completed. It provides an easy way to organize your manga collection and discover new titles.",
};

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const isValidLocale = routing.locales.includes(locale as "en" | "pt");
  const effectiveLocale = isValidLocale ? locale : routing.defaultLocale;

  const messages = await getMessages({ locale: effectiveLocale });

  return (
    <LangAndFontProvider
      locale={effectiveLocale}
      fonts={`${geistSans.variable} ${geistMono.variable}`}
    >
      <Providers messages={messages} locale={effectiveLocale}>
        <div className="min-h-screen flex flex-col">
          <Header />
          <main className="flex-1">{children}</main>
          <Footer />
        </div>
      </Providers>
    </LangAndFontProvider>
  );
}
