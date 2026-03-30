import Script from "next/script";
import { GoogleAnalyticsPageView } from "@/components/analytics/google-analytics-page-view";

const measurementId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID?.trim();

export function GoogleAnalytics() {
  if (!measurementId) {
    return null;
  }

  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${measurementId}`}
        strategy="afterInteractive"
      />
      <Script id="google-analytics-init" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          window.gtag = gtag;
          window.__mtGaLastPagePath = window.location.pathname + window.location.search;
          gtag('js', new Date());
          gtag('config', '${measurementId}', { send_page_view: false });
          gtag('event', 'page_view', { page_path: window.__mtGaLastPagePath });
        `}
      </Script>
      <GoogleAnalyticsPageView measurementId={measurementId} />
    </>
  );
}
