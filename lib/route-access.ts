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

