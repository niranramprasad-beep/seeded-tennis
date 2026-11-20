"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { sectionFromLegacyLink, settingsHref } from "@/lib/settings-sections";

// /settings, now that every section has its own URL. Sends you to the
// section an old link meant: `/settings?tab=family` (read on the server and
// passed in) or `/settings#family` (a hash never reaches the server, so it
// is read here). Anything else lands on Profile, which is what /settings
// always opened on. A replace, not a push, so Back skips this hop.
export function SettingsIndexRedirect({ tab }: { tab?: string | null }) {
  const router = useRouter();
  useEffect(() => {
    const hash = typeof window !== "undefined" ? window.location.hash : "";
    router.replace(settingsHref(sectionFromLegacyLink(hash, tab)));
  }, [router, tab]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center" aria-busy="true">
      <span className="sr-only">Opening Settings…</span>
      <span className="h-8 w-8 animate-spin rounded-full border-2 border-line border-t-grass motion-reduce:animate-none" />
    </div>
  );
}
