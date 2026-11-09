"use client";

import { useRouter } from "next/navigation";
import useSWR from "swr";
import { AuthGate } from "@/components/shared/auth-gate";
import { usePlayer } from "@/lib/context/player-context";
import { useTier } from "@/lib/context/tier-context";
import { loadFamilyMembers } from "@/lib/supabase/features";
import { loadMembershipSnapshot } from "@/lib/supabase/billing";
import { SeededSettingsShell } from "./seeded-settings-shell";
import { BillingContent } from "./billing-content";

// Pixel-exact to "16 Billing.png", with every number and date sourced from
// real data instead of the mockup's example family — see billing-content's
// doc comments for exactly what each field maps to and what's honestly
// omitted (e.g. invoice rows: no invoice/payment table exists anywhere in
// this app's Supabase schema or webhook, so that card shows an honest
// empty state rather than invented rows).
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
  const router = useRouter();

  const { data: familyMembers } = useSWR(
    hydrated ? "billing-family-members" : null,
    () => loadFamilyMembers()
  );
  const { data: membership } = useSWR(
    hydrated && tier !== "free" ? "billing-membership" : null,
    () => loadMembershipSnapshot()
  );

  return (
    <SeededSettingsShell active="billing" onTabChange={() => router.push("/settings")}>
      <BillingContent
        player={player}
        tier={tier}
        familyMembers={familyMembers ?? []}
        membership={membership ?? null}
      />
    </SeededSettingsShell>
  );
}
