"use client";

import { useState } from "react";
import useSWR from "swr";
import { useRouter } from "next/navigation";
import type { BillingInterval, SubscriptionTier } from "@/lib/types";
import { useTier } from "@/lib/context/tier-context";
import { usePlayer } from "@/lib/context/player-context";
import { getSupabase } from "@/lib/supabase/client";
import { CHECKOUT_FAILED, CHECKOUT_FAMILY_ALREADY, checkoutFailureMessage } from "@/lib/checkout-messages";
import { loadFamilyPlanStatus, type FamilyPlanStatus } from "@/lib/db/family-plan";
import { planButtonState, type PlanButtonState } from "@/lib/plan-entry";

// The /pricing checkout wiring: plan choice, sign-in hand-off and the
// billing-portal link, kept out of the view so it can be read on its own.

async function getAccessToken(): Promise<string | undefined> {
  const supabase = getSupabase();
  const { data } = (await supabase?.auth.getSession()) ?? { data: { session: null } };
  return data.session?.access_token;
}

export type { PlanButtonState };

export function usePlanCheckout(interval: BillingInterval) {
  const { tier } = useTier();
  const { isAuthed, hydrated } = usePlayer();
  const router = useRouter();
  const [loadingTier, setLoadingTier] = useState<SubscriptionTier | null>(null);
  // Which card the message belongs to: it is shown under THAT card's Choose
  // button (final-check A8), not as a page-level banner far from the click.
  const [error, setError] = useState<{ tier: SubscriptionTier; message: string } | null>(null);

  // `tier` from useTier() is "free" for a signed-out visitor as well as for a
  // signed-in free user, so "current" is gated on actually being signed in.
  // While the session is still hydrating nobody is "current" either, so a
  // card never flickers from a claim to a CTA.
  const signedIn = hydrated && isAuthed;

  // Is the viewer's family already unlocked by someone's Family plan? Then
  // "Choose Family" would sell that family a second one (lib/plan-entry.ts).
  // Same SWR key as the family screens, so it is usually already cached.
  const { data: familyPlan } = useSWR<FamilyPlanStatus>(
    signedIn ? "family-plan-status" : null,
    () => loadFamilyPlanStatus()
  );

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

    setError(null);
    setLoadingTier(t);
    try {
      // The button is disabled once the status is known; this covers a
      // click that lands before it loaded.
      if (t === "family" && (familyPlan ?? (await loadFamilyPlanStatus())).unlocked) {
        setError({ tier: t, message: CHECKOUT_FAMILY_ALREADY });
        setLoadingTier(null);
        return;
      }
      const token = await getAccessToken();
      const res = await fetch("/api/whop/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ tier: t, interval }),
      });
      // Never `await res.json()` bare: a platform error page is HTML, and
      // the parser's own text used to become the message.
      const payload: unknown = await res.json().catch(() => null);
      const url = (payload as { url?: unknown } | null)?.url;
      if (res.ok && typeof url === "string" && url) {
        window.location.href = url;
        return;
      }
      // A Vercel Preview answers 503 with its own sentence (no Whop key
      // there) — lib/checkout-messages.ts.
      setError({ tier: t, message: checkoutFailureMessage(payload) });
      setLoadingTier(null);
    } catch {
      setError({ tier: t, message: CHECKOUT_FAILED });
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

  const buttonState = (planTier: SubscriptionTier, planName: string): PlanButtonState =>
    planButtonState({
      signedIn,
      tier,
      planTier,
      planName,
      loadingTier,
      familyUnlocked: familyPlan?.unlocked === true,
    });

  return {
    tier,
    signedIn,
    /** The message for one plan card, or null. */
    errorFor: (planTier: SubscriptionTier): string | null =>
      error && error.tier === planTier ? error.message : null,
    /** Drop a shown error, e.g. when the Monthly/Yearly toggle changes the
     * prices it was about. */
    clearError: () => setError(null),
    busy: loadingTier !== null,
    choose,
    manageBilling,
    buttonState,
  };
}
