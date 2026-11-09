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
  signOut as signOutOfSupabase,
} from "@/lib/auth";
import { createUtrEntry } from "@/lib/db/plan";
import { localDateKey } from "@/lib/time";

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
      setConnectionError(null);
    } else if (state.status === "signed-out") {
      setPlayer(emptyPlayer);
      setIsAuthed(false);
      setConnectionError(null);
    } else {
      setConnectionError(state.message);
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  const retryConnection = useCallback(() => {
    void hydrate();
  }, [hydrate]);

  // Start an authenticated session with a (possibly not-yet-onboarded) player —
  // used right after sign-up, before the tennis profile is filled in.
  const beginSession = useCallback((next: Player) => {
    setPlayer(next);
    setIsAuthed(true);
  }, []);

  const completeOnboarding = useCallback((next: Player) => {
    const finalized = { ...next, onboarded: true };
    setPlayer(finalized);
    setIsAuthed(true);
    void saveCurrentPlayer(finalized);
    // The onboarding UTR must count as a dated entry from day one — otherwise
    // it has no date to compare against, and the first later backfill (even
    // an older one) would wrongly become "the most recent entry on record."
    void createUtrEntry({
      utr: finalized.currentUTR,
      recordedAt: localDateKey(),
      note: "Starting UTR",
    });
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

  const signOut = useCallback(() => {
    setIsAuthed(false);
    setPlayer(emptyPlayer);
    void signOutOfSupabase();
  }, []);

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
