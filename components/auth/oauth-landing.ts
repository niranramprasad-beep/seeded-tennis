// What /auth/callback does once Google's code has become a session.
// Pure (its two effects are passed in) so oauth-landing.test.ts can walk it.
//
// The returning-user half used to only navigate. PlayerProvider decides
// "signed in" from its first hydrate() plus beginSession(); it deliberately
// ignores a SIGNED_IN event while the tab shows nobody (authEventAction in
// lib/session-identity.ts — the page that signed you in is expected to call
// beginSession). The callback never did, so whether the header and sidebar
// switched to the signed-in app depended on whether that first hydrate()
// happened to see the session the callback was still creating. When it did
// not, the user landed on /today under the public "Sign in" header until
// they refreshed (final-check, reported in the 2026-11-21 review call).
//
// Now: load the player, hand it to beginSession, THEN navigate — the same
// order the password sign-in (components/auth/login-form.tsx) uses.

import type { Player } from "@/lib/types";

export interface OAuthLandingDeps {
  /** The signed-in user's Seeded player, or null when there is no profile row
   * yet (a Google SIGN-UP) — or it could not be read, which is treated the
   * same way, as before: /auth/complete reads it again. */
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
  const player = await deps.loadPlayer();
  if (!player) {
    // Authenticated, but not finished signing up.
    return next ? `${completePath}?next=${encodeURIComponent(next)}` : completePath;
  }
  deps.beginSession(player);
  return next ?? "/today";
}
