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

const TIER_KEY = "seeded.tier";

const RANK: Record<SubscriptionTier, number> = {
  free: 0,
  player: 1,
  family: 2,
};

interface TierContextValue {
  tier: SubscriptionTier;
  hydrated: boolean;
  setTier: (tier: SubscriptionTier) => void;
  /** True when the current tier meets or exceeds the required tier. */
  canAccess: (required: SubscriptionTier) => boolean;
  isPaid: boolean;
  isFamily: boolean;
}

const TierContext = createContext<TierContextValue | null>(null);

export function TierProvider({ children }: { children: ReactNode }) {
  const [tier, setTierState] = useState<SubscriptionTier>("free");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(TIER_KEY) as SubscriptionTier | null;
      if (stored && stored in RANK) setTierState(stored);
    } catch {
      // ignore
    }
    setHydrated(true);
  }, []);

  const setTier = useCallback((next: SubscriptionTier) => {
    setTierState(next);
    try {
      window.localStorage.setItem(TIER_KEY, next);
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
