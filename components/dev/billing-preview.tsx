"use client";

import { useState } from "react";
import type { Player, SubscriptionTier } from "@/lib/types";
import type { FamilyMember } from "@/lib/db/family";
import type { MembershipSnapshot } from "@/lib/db/settings";
import { emptyPlayer } from "@/lib/data/user";
import { PlayerContext } from "@/lib/context/player-context";
import { TierContext } from "@/lib/context/tier-context";
import { SeededSettingsShell } from "@/components/seeded/settings/seeded-settings-shell";
import { BillingContent } from "@/components/seeded/settings/billing-content";

// Internal tool only — pixel-checks /settings/billing's real card content
// against every tier (Free/Player/Family) without signing in through real
// auth or ever hitting Supabase/Whop (local dev shares production's
// Supabase project — see CLAUDE.md). Both PlayerContext and TierContext
// are faked directly (same trick as settings-preview.tsx), and
// familyMembers/membership are passed as plain mock props straight into
// BillingContent — the one real network call this page would normally
// make (loadFamilyMembers(), loadMembershipSnapshot()) never fires here.
// Not a route meant to ship; see app/dev/billing-preview/page.tsx (404s in
// prod).
const MOCK_PLAYER: Player = {
  ...emptyPlayer,
  name: "Maya Chen",
  currentUTR: 10.75,
  graduationYear: 2028,
  gender: "female",
  country: "United States",
  role: "player",
  familyCode: "CHEN-8X2K",
  onboarded: true,
};

const MOCK_FAMILY_MEMBERS: FamilyMember[] = [
  { id: "p1", name: "Maya Chen", email: "maya@example.com", role: "player", currentUtr: 10.75, graduationYear: 2028, onboarded: true },
  { id: "p2", name: "Wei Chen", email: "wei@example.com", role: "parent", currentUtr: 0, graduationYear: null, onboarded: true },
];

const MOCK_MEMBERSHIP: MembershipSnapshot = {
  status: "active",
  currentPeriodEnd: "2027-09-14",
  cancelAtPeriodEnd: false,
  manageUrl: null,
};

const TIERS: { value: SubscriptionTier; label: string }[] = [
  { value: "free", label: "Free" },
  { value: "player", label: "Player" },
  { value: "family", label: "Family" },
];

export function BillingPreview() {
  const [tier, setTier] = useState<SubscriptionTier>("family");

  return (
    <PlayerContext.Provider
      value={{
        player: MOCK_PLAYER,
        isAuthed: true,
        hydrated: true,
        connectionError: null,
        retryConnection: () => {},
        beginSession: () => {},
        completeOnboarding: () => {},
        updatePlayer: async () => true,
        setPlayerLocal: () => {},
        signOut: () => {},
      }}
    >
      <TierContext.Provider
        value={{
          tier,
          hydrated: true,
          setTier,
          canAccess: () => true,
          isPaid: tier !== "free",
          isFamily: tier === "family",
        }}
      >
        <div className="flex items-center gap-2 border-b border-line bg-cream px-6 py-3 text-sm">
          <span className="font-semibold text-ink">Dev preview — tier:</span>
          {TIERS.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => setTier(t.value)}
              className={`rounded-pill border px-3 py-1 text-xs font-semibold ${
                tier === t.value ? "border-grass bg-grass-50 text-grass" : "border-line bg-card text-stone"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <SeededSettingsShell active="billing" onTabChange={() => {}}>
          <BillingContent
            player={MOCK_PLAYER}
            tier={tier}
            familyMembers={MOCK_FAMILY_MEMBERS}
            membership={tier === "free" ? null : MOCK_MEMBERSHIP}
          />
        </SeededSettingsShell>
      </TierContext.Provider>
    </PlayerContext.Provider>
  );
}
