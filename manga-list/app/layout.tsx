import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Manga Tracker",
  description: "Track your manga collection",
  other: {
    "admaven-placement": "Bqjs9rHk5",
  },
  verification: {
    google: "0U3RXoZImZOpd6NaZ6Uz_m_rD5HG82J4LXNQeDQ9U34",
  },
  icons: {
    icon: [
      {
        url: "/logos/logo-icon-light.svg",
        media: "(prefers-color-scheme: light)",
      },
      {
        url: "/logos/logo-icon-dark.svg",
        media: "(prefers-color-scheme: dark)",
      },
    ],
    apple: "/logos/logo-icon-light.svg",
    shortcut: "/logos/logo-icon-light.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html suppressHydrationWarning>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}

