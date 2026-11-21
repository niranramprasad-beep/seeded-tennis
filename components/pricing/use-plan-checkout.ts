"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { TIER_RANK, type BillingInterval, type SubscriptionTier } from "@/lib/types";
import { useTier } from "@/lib/context/tier-context";
import { usePlayer } from "@/lib/context/player-context";
import { getSupabase } from "@/lib/supabase/client";

// The /pricing checkout wiring: plan choice, sign-in hand-off and the
// billing-portal link, kept out of the view so it can be read on its own.

async function getAccessToken(): Promise<string | undefined> {
  const supabase = getSupabase();
  const { data } = (await supabase?.auth.getSession()) ?? { data: { session: null } };
  return data.session?.access_token;
}

export interface PlanButtonState {
  /** Signed in AND on exactly this tier. */
  current: boolean;
  /** Signed in on a higher tier — never a checkout target. */
  includedAlready: boolean;
  loading: boolean;
  disabled: boolean;
  label: string;
}

export function usePlanCheckout(interval: BillingInterval) {
  const { tier } = useTier();
  const { isAuthed, hydrated } = usePlayer();
  const router = useRouter();
  const [loadingTier, setLoadingTier] = useState<SubscriptionTier | null>(null);
  const [error, setError] = useState("");

  // `tier` from useTier() is "free" for a signed-out visitor as well as for a
  // signed-in free user, so "current" is gated on actually being signed in.
  // While the session is still hydrating nobody is "current" either, so a
  // card never flickers from a claim to a CTA.
  const signedIn = hydrated && isAuthed;

  // Only ever called for a genuine upgrade, or by a signed-out visitor — the
  // button is disabled for the current tier and anything below it. Switching
  // down happens on Whop, reached from /settings/billing via manageBilling().
  const choose = async (t: SubscriptionTier) => {
    // Signed-out visitors need an account first — nothing to bill yet. Except
    // on Free, where the free thing is the fit report: take them to it.
    if (!signedIn) {
      router.push(t === "free" ? "/onboarding" : "/signup");
      return;
    }

    setError("");
    setLoadingTier(t);
    try {
      const token = await getAccessToken();
      const res = await fetch("/api/whop/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ tier: t, interval }),
      });
      const payload = await res.json();
      if (!res.ok || !payload.url) throw new Error(payload.error || "Could not start checkout.");
      window.location.href = payload.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start checkout.");
      setLoadingTier(null);
    }
  };

  // /settings/billing, never Whop directly: only that page knows whether
  // this person is the one who pays. A player whose parent pays, sent
  // straight to Whop, gets "You do not have access to this page on this
  // account. Press continue to switch accounts." (lib/billing-links.test.ts)
  const manageBilling = () => {
    router.push("/settings/billing");
  };

  const buttonState = (planTier: SubscriptionTier, planName: string): PlanButtonState => {
    const current = signedIn && tier === planTier;
    // Any plan ranked below what the user already has must never start a
    // checkout — clicking Player while on Family would open a brand-new Whop
    // checkout for a tier already exceeded.
    const includedAlready = !current && TIER_RANK[planTier] < TIER_RANK[tier];
    const loading = loadingTier === planTier;
    const label = loading
      ? "Redirecting..."
      : current
        ? "Current plan"
        : includedAlready
          ? "Included in your plan"
          : !signedIn && planTier === "free"
            ? "Start free"
            : `Choose ${planName}`;
    return { current, includedAlready, loading, disabled: current || includedAlready || loading, label };
  };

  return {
    tier,
    signedIn,
    error,
    busy: loadingTier !== null,
    choose,
    manageBilling,
    buttonState,
  };
}
