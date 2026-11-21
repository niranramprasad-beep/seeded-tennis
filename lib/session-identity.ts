// Whose session this tab is showing — the user id PlayerProvider exposes to
// key per-account caches (the consent answer: AuthGate, the star hook,
// Google Analytics). Pure, so lib/session-identity.test.ts can walk every
// transition; lib/context/player-context.tsx only applies the answers.
//
// The id is a cache key, never an authorisation: RLS decides what a session
// may read. What matters here is (1) a live session's id is never dropped
// while the app is signed in (a null key means "consent not asked yet", and
// AuthGate and the star hook wait on it), and (2) a different account never
// inherits the previous one's key.

/** What PlayerProvider does with a Supabase onAuthStateChange event. */
export type AuthEventAction = "none" | "rehydrate" | "signOutLocal";

/**
 * - SIGNED_OUT while this tab shows an account: sign this tab out locally
 *   (the only action that clears browser storage — another tab signed out).
 * - SIGNED_IN for a DIFFERENT user than the one shown: re-hydrate (another
 *   tab switched accounts).
 * - Everything else — INITIAL_SESSION, TOKEN_REFRESHED, USER_UPDATED,
 *   PASSWORD_RECOVERY, the same user signing in again, or a sign-in while
 *   this tab shows nobody (this tab's own sign-in page is about to call
 *   beginSession) — changes nothing.
 */
export function authEventAction(
  event: string,
  sessionUserId: string | null,
  currentUserId: string | null
): AuthEventAction {
  if (event === "SIGNED_OUT") return currentUserId !== null ? "signOutLocal" : "none";
  if (event !== "SIGNED_IN") return "none";
  if (!sessionUserId || currentUserId === null || sessionUserId === currentUserId) return "none";
  return "rehydrate";
}

export type IdentityInput =
  /** hydrate(): a session and a profile row. */
  | { type: "hydrate-authed"; userId: string }
  /** hydrate(): no profile row — with the live session's id if there is one. */
  | { type: "hydrate-signed-out"; sessionUserId: string | null }
  /** hydrate(): Supabase unreachable — nothing learned. */
  | { type: "hydrate-error" }
  /** The session's id read directly (beginSession, or the fallback lookup). */
  | { type: "session-lookup"; sessionUserId: string | null }
  /** This tab's own sign-out. */
  | { type: "sign-out" }
  | { type: "auth-event"; event: string; sessionUserId: string | null };

/** The user id after an input. */
export function nextUserId(current: string | null, input: IdentityInput): string | null {
  switch (input.type) {
    case "hydrate-authed":
      return input.userId;
    case "hydrate-signed-out":
      // A live session with no profile yet keeps its id: the next step is
      // beginSession() on /auth/complete, and dropping the id here left the
      // consent check unasked for a Google sign-up.
      return input.sessionUserId ?? null;
    case "hydrate-error":
      return current;
    case "session-lookup":
      return input.sessionUserId ?? current;
    case "sign-out":
      return null;
    case "auth-event": {
      const action = authEventAction(input.event, input.sessionUserId, current);
      if (action === "signOutLocal") return null;
      if (action === "rehydrate") return input.sessionUserId;
      return current;
    }
  }
}

/** Signed in to the app but whose session it is not known yet: look it up.
 * AuthGate and the star hook wait while this is true, so it must resolve. */
export function needsUserIdLookup(isAuthed: boolean, userId: string | null): boolean {
  return isAuthed && !userId;
}

/** How many times, and how far apart, the fallback lookup retries. */
export const USER_ID_LOOKUP_RETRIES = 5;
export const USER_ID_LOOKUP_DELAY_MS = 1000;
