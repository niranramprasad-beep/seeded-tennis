// Which signed-in role may open which path. AuthGate enforces these (a
// redirect, i.e. cosmetic — RLS is the control); the sidebar and the ⌘K
// palette must only offer paths these allow, which
// lib/nav-single-source.test.ts checks.
//
// Public pages (/, /schools, /schools/[slug], /pricing, …) are not wrapped
// in AuthGate at all, so they are reachable by every role and do not appear
// here.

// Pages a parent account can use. Everything else redirects to /family so
// parents never land in player-only tools like the roadmap or match mode.
// /family IS the parent dashboard — there is no separate /parent-dashboard route.
export function isParentAllowedPath(pathname: string): boolean {
  return (
    pathname.startsWith("/family") ||
    // startsWith, not ===, so /settings/billing (parents are typically the
    // ones actually billed — see billing-content.tsx's "Billed to" line)
    // stays reachable alongside /settings itself.
    pathname.startsWith("/settings") ||
    pathname === "/cost-calculator" ||
    pathname === "/tournament-fit"
  );
}

// P0-8. Pages an under-13 account still reaches while it waits for a
// parent's consent. Both are about the account itself rather than about
// tennis, and the database allows both for a pending account by design:
// /settings so they can download or delete their own data (their own
// profile row is the one thing a pending account can read), and /family so
// they can see who they are waiting on and fix a mistyped family code.
export function isConsentPendingAllowedPath(pathname: string): boolean {
  return pathname.startsWith("/settings") || pathname.startsWith("/family");
}

// /family is parent-only content (it's framed as "Follow [player]'s climb" —
// wrong framing for the player themselves). Everything else a player can
// reach is either player-only or shared (schools, settings, etc.), so this
// is the one path that needs an explicit block in the other direction.
export function isPlayerBlockedPath(pathname: string): boolean {
  return pathname.startsWith("/family");
}


// Reachable by a signed-in player who has not finished onboarding. Only
// Settings: exporting or deleting an account must never require handing
// over more data first (/privacy promises both "without asking").
export function isOnboardingExemptPath(pathname: string): boolean {
  return pathname.startsWith("/settings");
}

// Routes that exist only for a signed-in user: every one renders AuthGate,
// which sends a visitor with no session to /login (measured 2026-11-19 for
// each prefix, query strings included — all land on a bare /login). Two
// readers:
//  - AppShell, to lay these out as the app (or as /login's header) while
//    the session check runs;
//  - the head script in app/layout.tsx, which sends a browser that holds NO
//    saved Supabase session straight to /login before any JS bundle loads
//    (D8: that client-side redirect used to wait for React, the session
//    check and /login's chunks — LCP 6.0 s on a slow-4G phone). Same
//    destination AuthGate picks, just earlier; still a redirect, not access
//    control. A browser that DOES hold a session is never redirected by it.
export const SIGNED_IN_ONLY_PREFIXES = [
  "/today", "/plan", "/outreach", "/events", "/family", "/settings", "/matches",
  "/match-mode", "/dashboard", "/roadmap", "/training", "/coaches", "/cost-calculator",
] as const;

export function isSignedInOnlyPath(pathname: string): boolean {
  return SIGNED_IN_ONLY_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}
