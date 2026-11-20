"use client";

import useSWR from "swr";
import { AuthGate } from "@/components/shared/auth-gate";
import { usePlayer } from "@/lib/context/player-context";
import { useTier } from "@/lib/context/tier-context";
import { loadFamilyMembers } from "@/lib/db/family";
import { loadBillingLookup } from "@/lib/db/settings";
import { billingViewState } from "@/lib/billing-view";
import { SeededSettingsShell } from "./seeded-settings-shell";
import { BillingContent } from "./billing-content";

// /settings/billing. Every "Manage billing" entry in the app lands here
// (lib/billing-links.test.ts), never straight on Whop or /pricing, because
// only this page knows whether the signed-in person is the one who pays.
//
// Who pays: the membership is attached to exactly one profile — the buyer's
// (`whop_membership_id`, written by the webhook / post-checkout sync). The
// lookup reads only the viewer's own row, so "none" with a paid tier means
// somebody else pays. Their name is not knowable without reading another
// user's `profiles` row (CLAUDE.md forbids it; family_members() does not
// say who pays), so `otherPayerFirstName` is not passed and the page says
// "The person who pays for Seeded manages billing from their own account."
export function SeededBillingView() {
  return (
    <AuthGate>
      <BillingInner />
    </AuthGate>
  );
}

function BillingInner() {
  const { player } = usePlayer();
  const { tier, hydrated } = useTier();

  const { data: familyMembers } = useSWR(
    hydrated ? "billing-family-members" : null,
    () => loadFamilyMembers()
  );
  const {
    data: lookup,
    mutate,
    isValidating,
  } = useSWR(hydrated && tier !== "free" ? "billing-lookup" : null, () => loadBillingLookup(), {
    revalidateOnFocus: false,
  });

  const view = hydrated
    ? billingViewState({ tier, lookup, viewerName: player.name })
    : ({ kind: "loading", tier } as const);

  return (
    <SeededSettingsShell active="billing">
      <BillingContent
        view={view}
        familyMembers={familyMembers ?? []}
        onRetry={() => void mutate()}
        retrying={isValidating}
      />
    </SeededSettingsShell>
  );
}
