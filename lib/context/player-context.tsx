"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Player } from "@/lib/types";
import { emptyPlayer } from "@/lib/data/user";
import {
  getSessionState,
  saveCurrentPlayer,
  getSessionUserId,
  signOut as signOutOfSupabase,
} from "@/lib/auth";
import {
  USER_ID_LOOKUP_DELAY_MS,
  USER_ID_LOOKUP_RETRIES,
  authEventAction,
  needsUserIdLookup,
  nextUserId,
} from "@/lib/session-identity";
import { createUtrEntry } from "@/lib/db/plan";
import { localDateKey } from "@/lib/time";
import { hasRealUtr } from "@/lib/utils";
// The role (and /schools' shape) kept for the NEXT page load only, so the
// head script in app/layout.tsx can size pre-session placeholders before
// React runs. Layout hints, never access decisions. Cleared on sign-out.
import { rememberRole, rememberSchoolsShape } from "@/lib/layout-hints";
import { mutate } from "swr";
import { isMyConsentStateKey } from "@/lib/db/family-join";
import { getSupabase } from "@/lib/supabase/client";
import { clearSeededBrowserStorage } from "@/lib/local-storage-cleanup";
import { runSignOut, type SignOutEffects } from "@/lib/sign-out-steps";

interface PlayerContextValue {
  player: Player;
  isAuthed: boolean;
  hydrated: boolean;
  /** Set when Supabase couldn't be reached while restoring a session — never
   * conflated with "signed out". Null means no connection problem. */
  connectionError: string | null;
  retryConnection: () => void;
  beginSession: (player: Player) => void;
  completeOnboarding: (player: Player) => void;
  /** Resolves true once the write really succeeded (or there was nothing
   * real to fail against — no backend configured, or signed out), false on
   * a real write failure. The UI update itself is synchronous/optimistic;
   * this promise is only for callers that need to react to a failure,
   * e.g. rolling back a star/unstar. */
  updatePlayer: (patch: Partial<Player>) => Promise<boolean>;
  /** Updates the in-memory player only — for fields a dedicated
   * zod-validated route handler already wrote server-side (see account
   * deletion in components/seeded/settings/seeded-settings-view.tsx). */
  setPlayerLocal: (patch: Partial<Player>) => void;
  signOut: () => void;
  /** Like signOut, but ends only THIS browser's Supabase session (scope
   * "local") and resolves once it is gone. For /auth/verified when Google
   * came back as a different account: that account may be someone else's
   * (a shared family Google account), so its other devices stay signed in. */
  signOutLocal: () => Promise<void>;
  /** The signed-in auth user's id, or null when signed out / not known yet.
   * Never part of `Player` (so never round-tripped into a profile write);
   * it exists to key per-account caches such as the consent answer. */
  userId: string | null;
}

// Exported (not just consumed via usePlayer()) so dev-only harness pages
// can mount a fake PlayerContext.Provider directly — needed to preview
// authenticated-only UI like the sidebar without ever signing in through
// the real auth flow against the shared Supabase project.
export const PlayerContext = createContext<PlayerContextValue | null>(null);

export function PlayerProvider({ children }: { children: ReactNode }) {
  const [player, setPlayer] = useState<Player>(emptyPlayer);
  const [isAuthed, setIsAuthed] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const userIdRef = useRef<string | null>(null);
  userIdRef.current = userId;

  // Supabase is the only source of truth for a session — there is no local
  // cache to fall back on. "Signed out" and "Supabase is unreachable" are
  // different states — only the former clears the session; the latter
  // surfaces connectionError so the UI can offer a retry instead of silently
  // bouncing an authenticated user to /login.
  //
  // This is the one check every single page waits on, and `retryConnection`
  // lets a user re-trigger it (clicking "Try again" more than once) — a
  // generation counter makes sure only the LATEST call is ever allowed to
  // commit state, so a slower, now-stale hydrate() from an earlier click
  // can never overwrite a newer, faster one.
  const hydrateGeneration = useRef(0);
  const hydrate = useCallback(async () => {
    const generation = ++hydrateGeneration.current;
    setHydrated(false);
    const state = await getSessionState();
    if (generation !== hydrateGeneration.current) return;
    if (state.status === "authed") {
      setPlayer(state.player);
      setIsAuthed(true);
      setUserId((cur) => nextUserId(cur, { type: "hydrate-authed", userId: state.userId }));
      setConnectionError(null);
      rememberRole(state.player.role === "parent" ? "parent" : "player");
    } else if (state.status === "signed-out") {
      setPlayer(emptyPlayer);
      setIsAuthed(false);
      // A live session with no profile row yet (Google sign-up, before
      // /auth/complete calls beginSession) keeps its id.
      setUserId((cur) =>
        nextUserId(cur, { type: "hydrate-signed-out", sessionUserId: state.sessionUserId ?? null })
      );
      setConnectionError(null);
      rememberRole(null);
    } else {
      setConnectionError(state.message);
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  // Identity changes, in this tab or another (supabase-js relays sign-in and
  // sign-out across tabs). What each event means is authEventAction()
  // (lib/session-identity.ts, tested): a sign-out elsewhere signs this tab
  // out and clears its storage; a DIFFERENT account signing in re-hydrates;
  // everything else changes nothing.
  useEffect(() => {
    const supa = getSupabase();
    if (!supa) return;
    const { data } = supa.auth.onAuthStateChange((event, session) => {
      const sessionUserId = session?.user?.id ?? null;
      const action = authEventAction(event, sessionUserId, userIdRef.current);
      if (action === "none") return;
      setUserId(nextUserId(userIdRef.current, { type: "auth-event", event, sessionUserId }));
      void mutate(isMyConsentStateKey, undefined, { revalidate: false });
      if (action === "signOutLocal") {
        setIsAuthed(false);
        setPlayer(emptyPlayer);
        rememberRole(null);
        // localStorage was cleared by the tab that signed out; this tab's
        // sessionStorage is its own.
        clearSeededBrowserStorage();
        return;
      }
      void hydrate();
    });
    return () => data.subscription.unsubscribe();
  }, [hydrate]);

  // Signed in but whose session is not known yet (beginSession's lookup has
  // not landed, or failed): look it up, retrying a few times, so AuthGate
  // and the star hook — which wait on a per-user consent key — never stay
  // stuck.
  const [lookupAttempt, setLookupAttempt] = useState(0);
  useEffect(() => {
    if (!needsUserIdLookup(isAuthed, userId)) {
      if (lookupAttempt !== 0) setLookupAttempt(0);
      return;
    }
    if (lookupAttempt >= USER_ID_LOOKUP_RETRIES) return;
    let cancelled = false;
    const timer = setTimeout(
      async () => {
        const sessionUserId = await getSessionUserId();
        if (cancelled) return;
        if (sessionUserId) setUserId((cur) => nextUserId(cur, { type: "session-lookup", sessionUserId }));
        else setLookupAttempt((n) => n + 1);
      },
      lookupAttempt === 0 ? 0 : USER_ID_LOOKUP_DELAY_MS
    );
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [isAuthed, userId, lookupAttempt]);

  // Every path that signs someone in (hydrate, sign-in's beginSession,
  // onboarding) lands here, so the role is stored before the next full load
  // whichever way the session started. Only once hydrated: before that,
  // `isAuthed` is false for everyone and would wipe a good value.
  useEffect(() => {
    if (!hydrated && !isAuthed) return;
    rememberRole(isAuthed ? (player.role === "parent" ? "parent" : "player") : null);
    // A player's /schools shape follows from their own rating alone, so it
    // can be stored before they ever open the page — the first /schools
    // load after sign-in is then sized right too. A parent's depends on the
    // family roster, which only /schools reads; it stores that itself.
    if (isAuthed && player.role !== "parent") {
      rememberSchoolsShape(hasRealUtr(player.currentUTR) ? "fit" : "prompt");
    }
  }, [hydrated, isAuthed, player.role, player.currentUTR]);

  const retryConnection = useCallback(() => {
    void hydrate();
  }, [hydrate]);

  // Start an authenticated session with a (possibly not-yet-onboarded) player —
  // used right after sign-up, before the tennis profile is filled in.
  const beginSession = useCallback((next: Player) => {
    // The caller has just proved this session (a sign-in, a sign-up, the
    // OAuth callback), so it is authoritative: a hydrate() still in flight
    // started before the session existed and must not overwrite it with
    // "signed out" or "can't reach", and the app is hydrated from here on.
    // Without this, after Google sign-in the header could stay on the public
    // "Sign in" nav (hydrated false, or a stale result winning) until a refresh.
    ++hydrateGeneration.current;
    setPlayer(next);
    setIsAuthed(true);
    setConnectionError(null);
    setHydrated(true);
    // Record whose session this is (it may be a different account from the
    // one this tab last showed). Until it lands, the fallback lookup above
    // covers it.
    void getSessionUserId().then((sessionUserId) =>
      setUserId((cur) => nextUserId(cur, { type: "session-lookup", sessionUserId }))
    );
  }, []);

  const completeOnboarding = useCallback((next: Player) => {
    const finalized = { ...next, onboarded: true };
    setPlayer(finalized);
    setIsAuthed(true);
    // Both of these used to be bare `void`s with no `.catch`. A failure was
    // an unhandled rejection: nothing written, nothing said, nothing logged.
    // That is the same silent-loss pattern that was fixed on /events, and it
    // sat one file over on the path that creates an account.
    void saveCurrentPlayer(finalized).catch((e) => {
      console.error("Onboarding profile save failed", e);
    });

    // The onboarding UTR must count as a dated entry from day one — otherwise
    // it has no date to compare against, and the first later backfill (even
    // an older one) would wrongly become "the most recent entry on record."
    //
    // Only when there IS one. `utr_entries_utr_check` (migration 006) is
    // `utr between 1 and 16.5` with no NULL escape, so writing the 0
    // "not tracked" sentinel raises 23514. A player who finishes onboarding
    // without entering a rating simply has no starting entry, which is the
    // truth.
    if (finalized.currentUTR > 0) {
      void createUtrEntry({
        utr: finalized.currentUTR,
        recordedAt: localDateKey(),
        note: "Starting UTR",
      }).catch((e) => {
        console.error("Onboarding UTR entry failed", e);
      });
    }
  }, []);

  // Tracks the latest player outside React's state-update batching so
  // updatePlayer can both merge against the freshest value AND return a
  // promise of the save's real outcome — needed by the star-to-target
  // optimistic update (lib/hooks/use-star-schools.ts) to decide whether to
  // roll back. A functional setState updater can't serve that second need:
  // its callback timing isn't guaranteed synchronous, so a promise created
  // inside it can't be reliably returned by this function.
  const playerRef = useRef(player);
  useEffect(() => {
    playerRef.current = player;
  }, [player]);

  const updatePlayer = useCallback((patch: Partial<Player>): Promise<boolean> => {
    const next = { ...playerRef.current, ...patch };
    playerRef.current = next; // keep rapid successive calls in the same tick consistent
    setPlayer(next);
    return saveCurrentPlayer(next);
  }, []);

  // For the few fields (so far: account deletion) that now write through
  // their OWN zod-validated route handler instead of the generic
  // saveCurrentPlayer()/updatePlayer() profile-patch — the write already
  // happened server-side by the time this is called, so this only ever
  // syncs the in-memory player object, never re-triggers a save.
  const setPlayerLocal = useCallback((patch: Partial<Player>) => {
    const next = { ...playerRef.current, ...patch };
    playerRef.current = next;
    setPlayer(next);
  }, []);

  // Both sign-outs run the same tested sequence (lib/sign-out-steps.ts).
  const signOutEffects = useMemo<SignOutEffects>(
    () => ({
      // An in-flight hydrate() must not repopulate what we are clearing.
      bumpHydrateGeneration: () => void ++hydrateGeneration.current,
      resetState: () => {
        setIsAuthed(false);
        setPlayer(emptyPlayer);
        rememberRole(null);
      },
      // A-033: nothing this browser remembered about the account outlives it
      // (theme and the internal-analytics flag excepted).
      clearBrowserStorage: () => void clearSeededBrowserStorage(),
      // Drop the cached consent answer, so the next account signed in on this
      // tab never reads the last one's (AuthGate, the star hook and Google
      // Analytics all key off it).
      forgetUser: () => {
        setUserId(null);
        void mutate(isMyConsentStateKey, undefined, { revalidate: false });
      },
      signOutOfSupabase: (scope) => signOutOfSupabase(scope === "local" ? { scope: "local" } : undefined),
    }),
    []
  );

  const signOut = useCallback(() => {
    void runSignOut(signOutEffects, "global");
  }, [signOutEffects]);

  const signOutLocal = useCallback(() => runSignOut(signOutEffects, "local"), [signOutEffects]);

  const value = useMemo(
    () => ({
      player,
      isAuthed,
      hydrated,
      connectionError,
      retryConnection,
      beginSession,
      completeOnboarding,
      updatePlayer,
      setPlayerLocal,
      signOut,
      signOutLocal,
      userId,
    }),
    [
      player,
      isAuthed,
      hydrated,
      connectionError,
      retryConnection,
      beginSession,
      completeOnboarding,
      updatePlayer,
      setPlayerLocal,
      signOut,
      signOutLocal,
      userId,
    ]
  );

  return (
    <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>
  );
}

export function usePlayer() {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error("usePlayer must be used within a PlayerProvider");
  return ctx;
}
