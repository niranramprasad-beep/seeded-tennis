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
import { TIER_RANK, type SubscriptionTier } from "@/lib/types";
import { getAuthedUser, getSupabase } from "@/lib/supabase/client";
import { usePlayer } from "./player-context";

// Demo-mode-only fallback for when Supabase isn't configured at all (no env
// vars) — mirrors the rest of the app's "local fallback" pattern. Once
// Supabase is configured, the real tier always comes from the database,
// never this.
const DEMO_TIER_KEY = "seeded.demo-tier";

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

// Exported (not just consumed via useTier()) for the same reason
// PlayerContext is — dev-only harness pages (e.g. billing-preview) need to
// mount a fake Provider with a fixed tier, without routing through the
// real Supabase-backed load() effect below.
export const TierContext = createContext<TierContextValue | null>(null);

export function TierProvider({ children }: { children: ReactNode }) {
  const { isAuthed, hydrated: playerHydrated } = usePlayer();
  const [tier, setTierState] = useState<SubscriptionTier>("free");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (!playerHydrated) return;
    const controller = new AbortController();

    async function load() {
      const supabase = getSupabase();
      if (!supabase || !isAuthed) {
        try {
          const stored = window.localStorage.getItem(DEMO_TIER_KEY) as SubscriptionTier | null;
          if (!controller.signal.aborted) setTierState(stored && stored in TIER_RANK ? stored : "free");
        } catch {
          if (!controller.signal.aborted) setTierState("free");
        }
        if (!controller.signal.aborted) setHydrated(true);
        return;
      }

      const { data: userData } = await getAuthedUser(supabase);
      const userId = userData.user?.id;
      if (!userId) {
        if (!controller.signal.aborted) {
          setTierState("free");
          setHydrated(true);
        }
        return;
      }

      const { data } = await supabase
        .from("profiles")
        .select("subscription_tier")
        .eq("id", userId)
        .abortSignal(controller.signal)
        .maybeSingle();

      if (!controller.signal.aborted) {
        const real = data?.subscription_tier as SubscriptionTier | undefined;
        setTierState(real && real in TIER_RANK ? real : "free");
        setHydrated(true);
      }
    }

    void load();
    return () => controller.abort();
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
    (required: SubscriptionTier) => TIER_RANK[tier] >= TIER_RANK[required],
    [tier]
  );

  const value = useMemo(
    () => ({
      tier,
      hydrated,
      setTier,
      canAccess,
      isPaid: TIER_RANK[tier] >= TIER_RANK.player,
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
