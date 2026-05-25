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

  const persist = useCallback((next: Player, authed: boolean) => {
    try {
      window.localStorage.setItem(PLAYER_KEY, JSON.stringify(next));
      window.localStorage.setItem(AUTH_KEY, String(authed));
    } catch {
      // storage may be unavailable; state still works in-memory
    }
  }, []);

  const clearStorage = useCallback(() => {
    try {
      window.localStorage.removeItem(PLAYER_KEY);
      window.localStorage.setItem(AUTH_KEY, "false");
    } catch {
      // ignore
    }
  }, []);

  // On load, the Supabase session is the source of truth (when configured).
  useEffect(() => {
    let cancelled = false;

    async function hydrate() {
      if (isSupabaseConfigured) {
        const current = await getCurrentPlayer();
        if (cancelled) return;
        if (current) {
          setPlayer(current);
          setIsAuthed(true);
          persist(current, true);
        } else {
          // No active session → treat as signed out (AuthGate redirects to /login).
          setPlayer(emptyPlayer);
          setIsAuthed(false);
          clearStorage();
        }
        setHydrated(true);
        return;
      }

      // Local fallback (no Supabase keys): trust localStorage.
      try {
        const storedPlayer = window.localStorage.getItem(PLAYER_KEY);
        const storedAuth = window.localStorage.getItem(AUTH_KEY);
        if (storedPlayer) setPlayer(JSON.parse(storedPlayer) as Player);
        if (storedAuth === "true") setIsAuthed(true);
      } catch {
        // ignore malformed storage
      }
      setHydrated(true);
    }

    hydrate();
    return () => {
      cancelled = true;
    };
  }, [persist, clearStorage]);

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
    setPlayer(emptyPlayer);
    void signOutOfSupabase();
    clearStorage();
  }, [clearStorage]);

  const value = useMemo(
    () => ({
      player,
      isAuthed,
      hydrated,
      beginSession,
      completeOnboarding,
      updatePlayer,
      signOut,
    }),
    [player, isAuthed, hydrated, beginSession, completeOnboarding, updatePlayer, signOut]
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
