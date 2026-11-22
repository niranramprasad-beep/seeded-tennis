// What /auth/callback does once Google's code has become a session.
// Pure (its two effects are passed in) so oauth-landing.test.ts can walk it.
//
// Before this, the returning-user half only navigated. PlayerProvider decides
// "signed in" from its first hydrate() plus beginSession(); it deliberately
// ignores a SIGNED_IN event while the tab shows nobody (authEventAction in
// lib/session-identity.ts — the page that signed you in is expected to call
// beginSession). The first hydrate() normally does see the session
// (supabase-js exchanges the code during client initialisation, which
// getSession/getUser wait for), but if it was still in flight at navigation,
// or ended in "can't reach" on a transient failure, /today rendered under the
// public "Sign in" header until a refresh (reported in the 2026-11-21 review
// call). Now: load the player and hand it to beginSession — which also marks
// the app hydrated and discards any in-flight hydrate() — THEN navigate, the
// same order as password sign-in (components/auth/login-form.tsx).

import type { Player } from "@/lib/types";

export interface OAuthLandingDeps {
  /** The signed-in user's Seeded player, or null when there is no profile row
   * yet (a Google SIGN-UP). A failed read is treated as null, as before this
   * change: /auth/complete checks again. */
  loadPlayer: () => Promise<Player | null>;
  /** PlayerProvider's beginSession. */
  beginSession: (player: Player) => void;
}

/** Where to send the browser. Calls beginSession first for a returning user. */
export async function landAfterOAuth(
  deps: OAuthLandingDeps,
  next: string | null,
  completePath: string
): Promise<string> {
  const player = await deps.loadPlayer().catch(() => null);
  if (!player) {
    // Authenticated, but not finished signing up.
    return next ? `${completePath}?next=${encodeURIComponent(next)}` : completePath;
  }
  deps.beginSession(player);
  return next ?? "/today";
}
