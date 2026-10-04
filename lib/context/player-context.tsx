"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
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
import { createUtrEntry } from "@/lib/supabase/utr";
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
  updatePlayer: (patch: Partial<Player>) => void;
  signOut: () => void;
}

const PlayerContext = createContext<PlayerContextValue | null>(null);

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
  const hydrate = useCallback(async () => {
    setHydrated(false);
    const state = await getSessionState();
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

  const updatePlayer = useCallback((patch: Partial<Player>) => {
    setPlayer((prev) => {
      const next = { ...prev, ...patch };
      void saveCurrentPlayer(next);
      return next;
    });
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
