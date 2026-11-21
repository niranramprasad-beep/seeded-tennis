"use client";

import Script from "next/script";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import useSWR from "swr";
import { usePlayer } from "@/lib/context/player-context";
import { MY_CONSENT_STATE_KEY, loadMyConsentState } from "@/lib/db/family-join";
import {
  browserAllowsGa,
  gaConfigParams,
  gaPageLocation,
  gaPageViewParams,
  gaReferrer,
  shouldLoadGa,
  stripInternalParam,
  syncInternalFlag,
  type GaAccountState,
} from "@/lib/ga-privacy";

const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
// Hard gate on production, independent of whether the ID happens to be set.
// .env.local also has this value (for convenience / Vercel CLI pull), so
// without this check local `next dev` would send real traffic to GA4 too.
const IS_PRODUCTION = process.env.NODE_ENV === "production";

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
    dataLayer?: unknown[];
  }
}

// Every rule about what GA may see and when lives in lib/ga-privacy.ts and
// is pinned by lib/ga-privacy.test.ts (which also scans this file). This is
// only the wiring:
//   - Nothing from Google is injected — no inline snippet, no gtag.js — until
//     shouldLoadGa() says yes. Until we know who this is, it waits.
//   - Once loaded, the same rule is re-asked on every change. When it turns
//     to no (an under-13 signs in, a visit to /auth/*), `ga-disable-<ID>` is
//     set so gtag sends nothing more, and no page_view is queued.
//   - GA is given the path only: page_path, page_location and page_referrer
//     are built from usePathname(), never from location.href or the query.
function readWebdriver(): boolean {
  try {
    return typeof navigator !== "undefined" && navigator.webdriver === true;
  } catch {
    return true;
  }
}

function safeLocalStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function setGaDisabled(id: string, disabled: boolean) {
  (window as unknown as Record<string, unknown>)[`ga-disable-${id}`] = disabled;
}

function GaController({ id }: { id: string }) {
  const pathname = usePathname() ?? "/";
  const { isAuthed, hydrated, connectionError } = usePlayer();
  // Same key as AuthGate, so this is one fetch, not two.
  const { data: consent, error: consentError } = useSWR(
    isAuthed && hydrated ? MY_CONSENT_STATE_KEY : null,
    () => loadMyConsentState()
  );

  const [env, setEnv] = useState<{ webdriver: boolean; internalFlag: boolean } | null>(null);
  const [scriptWanted, setScriptWanted] = useState(false);
  const bootstrapped = useRef(false);
  const visitPath = useRef<string | null>(null);
  const sentForVisit = useRef(false);
  const lastLocation = useRef<string | undefined>(undefined);

  // Browser checks, re-run on every route change: ?seeded_internal= can
  // arrive on any URL, and is stripped from the address bar straight away
  // (other params and the hash kept).
  useEffect(() => {
    const internalFlag = syncInternalFlag(window.location.search, safeLocalStorage());
    const stripped = stripInternalParam(window.location.href);
    if (stripped !== null) {
      try {
        window.history.replaceState(window.history.state, "", stripped);
      } catch {
        // Leave the URL as it is; the flag is already applied.
      }
    }
    const webdriver = readWebdriver();
    setEnv((prev) =>
      prev && prev.webdriver === webdriver && prev.internalFlag === internalFlag
        ? prev
        : { webdriver, internalFlag }
    );
  }, [pathname]);

  const account: GaAccountState =
    !hydrated || connectionError
      ? { kind: "unknown" }
      : !isAuthed
        ? { kind: "signed-out" }
        : { kind: "signed-in", consentStatus: consentError ? "unknown" : consent?.status };

  const allowed = shouldLoadGa({
    pathname,
    account,
    webdriver: env?.webdriver,
    internalFlag: env?.internalFlag,
  });

  useEffect(() => {
    if (visitPath.current !== pathname) {
      visitPath.current = pathname;
      sentForVisit.current = false;
    }

    // `env` can be one render behind a client-side navigation that carried
    // ?seeded_internal=1, so the browser checks are asked again, fresh,
    // before anything is loaded or sent.
    const allowedNow =
      allowed &&
      browserAllowsGa({
        webdriver: readWebdriver(),
        internalFlag: syncInternalFlag("", safeLocalStorage()),
      });

    if (!allowedNow) {
      // Loaded earlier, not allowed now: gtag drops every hit from here on.
      if (bootstrapped.current) setGaDisabled(id, true);
      return;
    }

    const origin = window.location.origin;
    if (!bootstrapped.current) {
      bootstrapped.current = true;
      setGaDisabled(id, false);
      window.dataLayer = window.dataLayer || [];
      // gtag.js reads Arguments objects off dataLayer, not arrays.
      window.gtag = function gtag() {
        // eslint-disable-next-line prefer-rest-params
        window.dataLayer!.push(arguments);
      };
      window.gtag("js", new Date());
      window.gtag(
        "config",
        id,
        gaConfigParams(gaPageLocation(origin, pathname), gaReferrer(document.referrer))
      );
      setScriptWanted(true);
    } else {
      setGaDisabled(id, false);
    }

    if (sentForVisit.current || !window.gtag) return;
    sentForVisit.current = true;
    // The first view's referrer is the page that linked here (query and
    // hash dropped); after that it is our own previous path.
    const referrer = lastLocation.current ?? gaReferrer(document.referrer);
    const params = gaPageViewParams(origin, pathname, referrer);
    // Keep gtag's own idea of the page in step, so nothing it sends by
    // itself carries a location we did not build.
    window.gtag("set", {
      page_location: params.page_location,
      ...(referrer ? { page_referrer: referrer } : {}),
    });
    window.gtag("event", "page_view", params);
    lastLocation.current = params.page_location;
  }, [allowed, pathname, id]);

  if (!scriptWanted) return null;
  // lazyOnload, not afterInteractive (D8, docs/archive/audit-2-perf.md):
  // afterInteractive makes Next emit a <link rel=preload> for this ~180 KB
  // script at the top of every document. gtag() above queues onto
  // window.dataLayer, so nothing is lost by waiting for `load`.
  return (
    <Script
      src={`https://www.googletagmanager.com/gtag/js?id=${id}`}
      strategy="lazyOnload"
    />
  );
}

// Renders nothing outside a production build, and nothing until
// NEXT_PUBLIC_GA_MEASUREMENT_ID is set — local dev and preview deploys never
// send traffic. Must sit inside <Providers> (it reads the session).
export function GoogleAnalytics() {
  if (!IS_PRODUCTION || !GA_MEASUREMENT_ID) return null;
  return <GaController id={GA_MEASUREMENT_ID} />;
}
