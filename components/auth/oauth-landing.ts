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
import type { SignupRoleIntent } from "@/lib/config/auth";

export interface OAuthLandingDeps {
  /** The signed-in user's Seeded player, or null when there is no profile row
   * yet (a Google SIGN-UP). A failed read is treated as null, as before this
   * change: /auth/complete checks again. */
  loadPlayer: () => Promise<Player | null>;
  /** PlayerProvider's beginSession. */
  beginSession: (player: Player) => void;
}

/**
 * Where a signed-in player goes when nothing asked for a page: the same split
 * as password sign-in (login-form.tsx) and the signed-in home redirect — a
 * parent to /family, a player who has not finished onboarding to
 * /onboarding, everyone else to /today. Google sign-in used to send every
 * returning user to /today and leave the split to AuthGate's second redirect.
 */
export function homeFor(player: Pick<Player, "role" | "onboarded">): string {
  if (player.role === "parent") return "/family";
  return player.onboarded ? "/today" : "/onboarding";
}

/** /auth/complete, carrying `next` and the sign-up page's role (both
 * optional, both already validated by the caller). */
export function completePathFor(
  completePath: string,
  next: string | null,
  role: SignupRoleIntent | null = null
): string {
  const query = new URLSearchParams();
  if (next) query.set("next", next);
  if (role) query.set("role", role);
  const qs = query.toString();
  return qs ? `${completePath}?${qs}` : completePath;
}

/** Where to send the browser. Calls beginSession first for a returning user. */
export async function landAfterOAuth(
  deps: OAuthLandingDeps,
  next: string | null,
  completePath: string,
  /** Which sign-up page the Google button was on. Used only for a NEW user;
   * a returning user's profile decides. */
  role: SignupRoleIntent | null = null
): Promise<string> {
  const player = await deps.loadPlayer().catch(() => null);
  if (!player) {
    // Authenticated, but not finished signing up.
    return completePathFor(completePath, next, role);
  }
  deps.beginSession(player);
  return next ?? homeFor(player);
}
