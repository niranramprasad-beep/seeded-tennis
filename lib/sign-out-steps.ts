// The one sign-out sequence PlayerProvider runs, for both its global
// signOut() and the local-only signOutLocal() (PR D: /auth/verified when
// Google came back as a different account). Effects are injected so the
// order is tested (lib/sign-out-steps.test.ts) without rendering React.

export interface SignOutEffects {
  /** Invalidate any in-flight hydrate() so it cannot repopulate the state
   *  this sign-out is clearing (PlayerProvider's hydrateGeneration). */
  bumpHydrateGeneration: () => void;
  /** Signed-out in-memory state: isAuthed false, emptyPlayer, no role hint. */
  resetState: () => void;
  /** A-033: nothing this browser remembered about the account outlives it. */
  clearBrowserStorage: () => void;
  /** The per-account caches keyed by user id (consent answer). */
  forgetUser: () => void;
  /** Supabase's sign-out with the given scope. */
  signOutOfSupabase: (scope: "global" | "local") => Promise<void>;
}

export async function runSignOut(fx: SignOutEffects, scope: "global" | "local"): Promise<void> {
  fx.bumpHydrateGeneration();
  fx.resetState();
  fx.clearBrowserStorage();
  fx.forgetUser();
  await fx.signOutOfSupabase(scope).catch(() => undefined);
}
