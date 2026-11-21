"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { AlertTriangle, RotateCw } from "lucide-react";
import type { ReactNode } from "react";
import useSWR from "swr";
import { usePlayer } from "@/lib/context/player-context";
import { loadMyConsentState, myConsentStateKey } from "@/lib/db/family-join";
import { ConsentPendingScreen } from "@/components/seeded/family/consent-pending-screen";
import { loginHrefFor } from "@/lib/config/auth";
import { Button } from "@/components/ui/button";
import {
  isConsentPendingAllowedPath,
  isOnboardingExemptPath,
  isParentAllowedPath,
  isPlayerBlockedPath,
} from "@/lib/route-access";

// Which role may open which path lives in lib/route-access.ts, so the nav
// lists can be tested against it (lib/nav-single-source.test.ts).
// Client-side guard for app pages. Redirects to login when there's no session,
// and to onboarding when the session exists but the tennis profile is unfinished.
// When Supabase itself is unreachable, this never redirects to /login — an
// unreachable backend must never look like "you're signed out".
export function AuthGate({
  children,
  fallback,
}: {
  children: ReactNode;
  /** What shows while the session resolves (or a redirect is pending). A
   *  page that has a skeleton passes it, so the wait and the page's own
   *  loading state are the same boxes and nothing jumps between them
   *  (design system v2 rule 6). Defaults to the spinner. */
  fallback?: ReactNode;
}) {
  const { isAuthed, hydrated, player, connectionError, retryConnection, userId } = usePlayer();

  // P0-8. A pending-consent account can read nothing, so every page it opens
  // would render as an empty, working-looking product. This asks the one
  // question it IS allowed to ask about itself (my_consent_state(), SECURITY
  // DEFINER) so the app can explain the emptiness instead. Not a gate — the
  // restrictive RLS policies in migration 030 are the gate.
  const { data: consent } = useSWR(
    isAuthed && hydrated ? myConsentStateKey(userId) : null,
    () => loadMyConsentState()
  );
  const awaitingParentConsent = consent?.status === "pending";
  // `undefined` means the fetch has not landed yet — distinct from a
  // resolved "no consent needed". The redirect below MUST wait for this,
  // because on the first effect pass `awaitingParentConsent` is false for
  // everyone, including an account that is in fact waiting.
  const consentResolved = consent !== undefined;
  const router = useRouter();
  const pathname = usePathname();
  // A blocked player lands on their home, /today.
  const playerHome = "/today";

  useEffect(() => {
    if (!hydrated || connectionError) return;
    if (!isAuthed) {
      // Keep where they were going (QA sweep M3); loginHrefFor only ever
      // carries a same-origin path, so this cannot become an open redirect.
      router.replace(loginHrefFor(pathname + window.location.search));
    } else if (player.role === "parent" && !isParentAllowedPath(pathname)) {
      router.replace("/family");
    } else if (player.role !== "parent" && isPlayerBlockedPath(pathname)) {
      router.replace(playerHome);
    } else if (
      player.role !== "parent" &&
      !player.onboarded &&
      pathname !== "/onboarding" &&
      // Settings stays reachable before onboarding: downloading or deleting
      // your account must not require first giving us more data. A new
      // signup was bounced from /settings to /onboarding, so /privacy's
      // "you do not need to ask us" was untrue until they finished it.
      !isOnboardingExemptPath(pathname) &&
      // A pending-consent account cannot complete onboarding — every write
      // it would make is refused by RLS — so sending it there would be a
      // loop of failing saves. It gets ConsentPendingScreen instead.
      //
      // WAIT FOR THE CONSENT FETCH. This guard was
      // `!awaitingParentConsent` alone, which is false on the first pass
      // for everyone because the SWR data is still undefined — so an
      // under-13 was redirected to /onboarding before anyone knew they
      // were waiting, and isConsentPendingAllowedPath() below could never
      // fire. The consent screen's own two links ("download or delete your
      // account", "check or change the family code") were dead loops back
      // to itself, while the screen promised both were available.
      consentResolved &&
      !awaitingParentConsent
    ) {
      router.replace("/onboarding");
    }
  }, [
    hydrated,
    connectionError,
    isAuthed,
    player.onboarded,
    player.role,
    pathname,
    router,
    playerHome,
    awaitingParentConsent,
    consentResolved,
  ]);

  if (hydrated && connectionError) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-error-bg text-error">
          <AlertTriangle className="h-5 w-5" />
        </span>
        <h1 className="mt-4 text-xl font-medium text-ink">
          We're having trouble connecting
        </h1>
        <p className="mt-2 max-w-sm text-sm text-stone">{connectionError}</p>
        <Button variant="outline" size="md" className="mt-5" onClick={retryConnection}>
          <RotateCw className="h-4 w-4" />
          Try again
        </Button>
      </div>
    );
  }

  if (awaitingParentConsent && !isConsentPendingAllowedPath(pathname)) {
    return <ConsentPendingScreen firstName={player.name?.split(" ")[0]} />;
  }

  // A consent-pending account can never finish onboarding — every write it
  // would make is refused by RLS — so treating "not onboarded" as a reason
  // to block left an under-13 staring at a spinner on /settings for ever.
  // Reaching the page was only half the fix: the consent screen promises
  // "you can still download or delete your account at any time, with or
  // without their approval", and that promise is about a child's data.
  const consentPendingAllowed =
    awaitingParentConsent && isConsentPendingAllowedPath(pathname);
  const blockedForOnboarding =
    player.role !== "parent" &&
    !player.onboarded &&
    pathname !== "/onboarding" &&
    !isOnboardingExemptPath(pathname) &&
    !consentPendingAllowed;
  const blockedForParent =
    player.role === "parent" && !isParentAllowedPath(pathname);
  const blockedForPlayer =
    player.role !== "parent" && isPlayerBlockedPath(pathname);

  if (!hydrated || !isAuthed || blockedForOnboarding || blockedForParent || blockedForPlayer) {
    if (fallback) return <>{fallback}</>;
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <motion.span
          className="h-8 w-8 rounded-full border-2 border-line border-t-grass"
          animate={{ rotate: 360 }}
          transition={{ duration: 0.9, repeat: Infinity, ease: "linear" }}
        />
      </div>
    );
  }

  return <>{children}</>;
}
