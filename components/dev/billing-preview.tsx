"use client";

import { useState } from "react";
import type { Player, SubscriptionTier } from "@/lib/types";
import type { FamilyMember } from "@/lib/db/family";
import type { BillingViewState } from "@/lib/billing-view";
import { emptyPlayer } from "@/lib/data/user";
import { PlayerContext } from "@/lib/context/player-context";
import { TierContext } from "@/lib/context/tier-context";
import { SeededSettingsShell } from "@/components/seeded/settings/seeded-settings-shell";
import { BillingContent } from "@/components/seeded/settings/billing-content";

// Internal tool only — renders /settings/billing's real card content in
// every state (app/dev/billing-preview/page.tsx builds them on the server
// with the real describePaidPlan()) without signing in through real auth or
// ever calling Supabase/Whop (local dev must not sign in to real accounts —
// see CLAUDE.md). PlayerContext and TierContext are faked directly, the
// same trick as settings-preview.tsx. 404s in production builds.

export interface BillingPreviewState {
  id: string;
  label: string;
  view: BillingViewState;
}

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
  { id: "p2", name: "Wei Chen", email: "wei@example.com", role: "parent", currentUtr: null, graduationYear: null, onboarded: true },
];

function tierOf(view: BillingViewState): SubscriptionTier {
  if (view.kind === "free") return "free";
  if (view.kind === "payer") return view.plan.tier;
  return view.tier;
}

export function BillingPreview({ states }: { states: BillingPreviewState[] }) {
  const [id, setId] = useState(states[0]?.id);
  const [retrying, setRetrying] = useState(false);
  const current = states.find((s) => s.id === id) ?? states[0];
  const tier = tierOf(current.view);

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
          setTier: () => {},
          canAccess: () => true,
          isPaid: tier !== "free",
          isFamily: tier === "family",
          refresh: async () => {},
        }}
      >
        <div className="flex flex-wrap items-center gap-2 border-b border-line bg-cream px-6 py-3 text-sm">
          <span className="font-semibold text-ink">Dev preview — state:</span>
          {states.map((s) => (
            <button
              key={s.id}
              type="button"
              aria-pressed={s.id === current.id}
              onClick={() => setId(s.id)}
              className={`rounded-pill border px-3 py-1 text-xs font-semibold ${
                s.id === current.id ? "border-grass bg-grass-50 text-grass" : "border-line bg-card text-stone"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
        <SeededSettingsShell active="billing">
          <BillingContent
            view={current.view}
            familyMembers={MOCK_FAMILY_MEMBERS}
            onRetry={() => {
              setRetrying(true);
              window.setTimeout(() => setRetrying(false), 800);
            }}
            retrying={retrying}
          />
        </SeededSettingsShell>
      </TierContext.Provider>
    </PlayerContext.Provider>
  );
}
