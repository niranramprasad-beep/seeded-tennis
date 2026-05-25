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
import { sampledPlayer } from "@/lib/data/user";
import {
  getCurrentPlayer,
  isSupabaseConfigured,
  saveCurrentPlayer,
  signOut as signOutOfSupabase,
} from "@/lib/auth";

const PLAYER_KEY = "seeded.player";
const AUTH_KEY = "seeded.authed";

interface PlayerContextValue {
  player: Player;
  isAuthed: boolean;
  hydrated: boolean;
  signInAsSample: () => void;
  beginSession: (player: Player) => void;
  completeOnboarding: (player: Player) => void;
  updatePlayer: (patch: Partial<Player>) => void;
  signOut: () => void;
}

const PlayerContext = createContext<PlayerContextValue | null>(null);

export function PlayerProvider({ children }: { children: ReactNode }) {
  const [player, setPlayer] = useState<Player>(sampledPlayer);
  const [isAuthed, setIsAuthed] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  const persist = useCallback((next: Player, authed: boolean) => {
    try {
      window.localStorage.setItem(PLAYER_KEY, JSON.stringify(next));
      window.localStorage.setItem(AUTH_KEY, String(authed));
    } catch {
      // storage may be unavailable; state still works in-memory
    }
  }, []);

  // Load persisted state once on the client.
  useEffect(() => {
    let cancelled = false;
    try {
      const storedPlayer = window.localStorage.getItem(PLAYER_KEY);
      const storedAuth = window.localStorage.getItem(AUTH_KEY);
      if (storedPlayer) setPlayer(JSON.parse(storedPlayer) as Player);
      if (storedAuth === "true") setIsAuthed(true);
    } catch {
      // ignore malformed storage
    }
    async function hydrateSupabaseSession() {
      if (!isSupabaseConfigured) {
        if (!cancelled) setHydrated(true);
        return;
      }

      const current = await getCurrentPlayer();
      if (cancelled) return;
      if (current) {
        setPlayer(current);
        setIsAuthed(true);
        persist(current, true);
      }
      setHydrated(true);
    }

    hydrateSupabaseSession();
    return () => {
      cancelled = true;
    };
  }, [persist]);

  const signInAsSample = useCallback(() => {
    setPlayer(sampledPlayer);
    setIsAuthed(true);
    persist(sampledPlayer, true);
  }, [persist]);

  // Start an authenticated session with a (possibly not-yet-onboarded) player —
  // used right after sign-up, before the tennis profile is filled in.
  const beginSession = useCallback(
    (next: Player) => {
      setPlayer(next);
      setIsAuthed(true);
      persist(next, true);
    },
    [persist]
  );

  const completeOnboarding = useCallback(
    (next: Player) => {
      const finalized = { ...next, onboarded: true };
      setPlayer(finalized);
      setIsAuthed(true);
      persist(finalized, true);
      void saveCurrentPlayer(finalized);
    },
    [persist]
  );

  const updatePlayer = useCallback(
    (patch: Partial<Player>) => {
      setPlayer((prev) => {
        const next = { ...prev, ...patch };
        persist(next, true);
        void saveCurrentPlayer(next);
        return next;
      });
    },
    [persist]
  );

  const signOut = useCallback(() => {
    setIsAuthed(false);
    setPlayer(sampledPlayer);
    void signOutOfSupabase();
    try {
      window.localStorage.removeItem(PLAYER_KEY);
      window.localStorage.setItem(AUTH_KEY, "false");
    } catch {
      // ignore
    }
  }, []);

  const value = useMemo(
    () => ({
      player,
      isAuthed,
      hydrated,
      signInAsSample,
      beginSession,
      completeOnboarding,
      updatePlayer,
      signOut,
    }),
    [
      player,
      isAuthed,
      hydrated,
      signInAsSample,
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
