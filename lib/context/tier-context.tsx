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
import type { SubscriptionTier } from "@/lib/types";
import { getSupabase } from "@/lib/supabase/client";
import { usePlayer } from "./player-context";

// Demo-mode-only fallback for when Supabase isn't configured at all (no env
// vars) — mirrors the rest of the app's "local fallback" pattern. Once
// Supabase is configured, the real tier always comes from the database,
// never this.
const DEMO_TIER_KEY = "seeded.demo-tier";

const RANK: Record<SubscriptionTier, number> = {
  free: 0,
  player: 1,
  family: 2,
};

interface TierContextValue {
  tier: SubscriptionTier;
  hydrated: boolean;
  /** Dev-only local override — see TierSwitcher, rendered only in development. */
  setTier: (tier: SubscriptionTier) => void;
  /** True when the current tier meets or exceeds the required tier. */
  canAccess: (required: SubscriptionTier) => boolean;
  isPaid: boolean;
  isFamily: boolean;
}

const TierContext = createContext<TierContextValue | null>(null);

export function TierProvider({ children }: { children: ReactNode }) {
  const { isAuthed, hydrated: playerHydrated } = usePlayer();
  const [tier, setTierState] = useState<SubscriptionTier>("free");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (!playerHydrated) return;
    let cancelled = false;

    async function load() {
      const supabase = getSupabase();
      if (!supabase || !isAuthed) {
        try {
          const stored = window.localStorage.getItem(DEMO_TIER_KEY) as SubscriptionTier | null;
          if (!cancelled) setTierState(stored && stored in RANK ? stored : "free");
        } catch {
          if (!cancelled) setTierState("free");
        }
        if (!cancelled) setHydrated(true);
        return;
      }

      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) {
        if (!cancelled) {
          setTierState("free");
          setHydrated(true);
        }
        return;
      }

      const { data } = await supabase
        .from("profiles")
        .select("subscription_tier")
        .eq("id", userId)
        .maybeSingle();

      if (!cancelled) {
        const real = data?.subscription_tier as SubscriptionTier | undefined;
        setTierState(real && real in RANK ? real : "free");
        setHydrated(true);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [isAuthed, playerHydrated]);

  // Local-only override — used by the dev tier switcher (development builds
  // only) to preview locked pages, and by the demo fallback when Supabase
  // isn't configured. Never the path real payments take.
  const setTier = useCallback((next: SubscriptionTier) => {
    setTierState(next);
    try {
      window.localStorage.setItem(DEMO_TIER_KEY, next);
    } catch {
      // ignore
    }
  }, []);

  const canAccess = useCallback(
    (required: SubscriptionTier) => RANK[tier] >= RANK[required],
    [tier]
  );

  const value = useMemo(
    () => ({
      tier,
      hydrated,
      setTier,
      canAccess,
      isPaid: RANK[tier] >= RANK.player,
      isFamily: tier === "family",
    }),
    [tier, hydrated, setTier, canAccess]
  );

  return <TierContext.Provider value={value}>{children}</TierContext.Provider>;
}

export function useTier() {
  const ctx = useContext(TierContext);
  if (!ctx) throw new Error("useTier must be used within a TierProvider");
  return ctx;
}
