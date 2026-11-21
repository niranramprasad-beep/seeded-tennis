"use client";

import Script from "next/script";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import useSWR from "swr";
import { usePlayer } from "@/lib/context/player-context";
import { loadMyConsentState, myConsentStateKey } from "@/lib/db/family-join";
import { gaAccountState } from "@/lib/ga-privacy";
import { GaRuntime } from "@/lib/ga-runtime";

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

// Wiring only. What GA may see and when is lib/ga-privacy.ts; what is done
// with gtag is lib/ga-runtime.ts. Both are driven by lib/ga-privacy.test.ts,
// which also checks that this file never touches gtag itself.
function GaController({ id }: { id: string }) {
  const pathname = usePathname() ?? "/";
  // Only as a trigger: ?seeded_internal= on the current path must apply
  // without waiting for the path to change. Its value is never read here.
  const searchKey = useSearchParams()?.toString() ?? "";
  const { isAuthed, hydrated, connectionError, userId } = usePlayer();
  // Same per-user key as AuthGate, so this is one fetch, not two.
  const { data: consent, error: consentError } = useSWR(
    isAuthed && hydrated ? myConsentStateKey(userId) : null,
    () => loadMyConsentState()
  );
  const account = useMemo(
    () => gaAccountState({ hydrated, connectionError, isAuthed, userId, consent, consentError }),
    [hydrated, connectionError, isAuthed, userId, consent, consentError]
  );

  const [scriptWanted, setScriptWanted] = useState(false);
  const runtime = useRef<GaRuntime | null>(null);

  // Created on the first client render, and asked on EVERY render whether
  // the path is a sign-in / sign-up page: guardPath() only ever switches
  // gtag off, and doing it here — before the route commits and its history
  // entry is pushed — keeps GA's own history listener from counting that
  // page when gtag.js was loaded earlier in the visit. Not on the server.
  if (typeof window !== "undefined") {
    if (!runtime.current) runtime.current = new GaRuntime(id, window, () => setScriptWanted(true));
    runtime.current.guardPath(pathname);
  }

  useEffect(() => {
    if (!runtime.current) return;
    runtime.current.update({ pathname, account });
  }, [id, pathname, searchKey, account]);

  if (!scriptWanted) return null;
  // lazyOnload, not afterInteractive (D8, docs/archive/audit-2-perf.md):
  // afterInteractive makes Next emit a <link rel=preload> for this ~180 KB
  // script at the top of every document. gtag() queues onto
  // window.dataLayer, so nothing is lost by waiting for `load`.
  return <Script src={`https://www.googletagmanager.com/gtag/js?id=${id}`} strategy="lazyOnload" />;
}

// Renders nothing outside a production build, and nothing until
// NEXT_PUBLIC_GA_MEASUREMENT_ID is set — local dev and preview deploys never
// send traffic. Must sit inside <Providers> (it reads the session). The
// Suspense boundary is for useSearchParams().
export function GoogleAnalytics() {
  if (!IS_PRODUCTION || !GA_MEASUREMENT_ID) return null;
  return (
    <Suspense fallback={null}>
      <GaController id={GA_MEASUREMENT_ID} />
    </Suspense>
  );
}
