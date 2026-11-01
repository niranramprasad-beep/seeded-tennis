"use client";

import Script from "next/script";
import { Suspense, useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";

const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
// Hard gate on production, independent of whether the ID happens to be set.
// .env.local also has this value (for convenience / Vercel CLI pull), so
// without this check local `next dev` would send real traffic to GA4 too.
const IS_PRODUCTION = process.env.NODE_ENV === "production";

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

// Fires a page_view on every client-side route change — gtag's default
// snippet only ever fires once, on the initial full page load, so without
// this every in-app navigation (which Next.js does without a real page
// load) would be invisible in GA4.
function PageViewTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!IS_PRODUCTION || !GA_MEASUREMENT_ID || !window.gtag) return;
    const query = searchParams.toString();
    window.gtag("config", GA_MEASUREMENT_ID, {
      page_path: query ? `${pathname}?${query}` : pathname,
    });
  }, [pathname, searchParams]);

  return null;
}

// Renders nothing outside a production build, and nothing until
// NEXT_PUBLIC_GA_MEASUREMENT_ID is set — safe to ship before you have a
// real GA4 property, and local dev / preview deploys never send traffic.
export function GoogleAnalytics() {
  if (!IS_PRODUCTION || !GA_MEASUREMENT_ID) return null;

  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
        strategy="afterInteractive"
      />
      <Script id="google-analytics-init" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){window.dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', '${GA_MEASUREMENT_ID}', { send_page_view: false });
        `}
      </Script>
      <Suspense fallback={null}>
        <PageViewTracker />
      </Suspense>
    </>
  );
}
