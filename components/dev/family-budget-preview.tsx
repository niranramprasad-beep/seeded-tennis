"use client";

import type { Player, SchoolLite } from "@/lib/types";
import { emptyPlayer } from "@/lib/data/user";
import { PlayerContext } from "@/lib/context/player-context";
import { SeededFamilyBudgetView } from "@/components/seeded/family/seeded-family-budget-view";

// Internal tool only — see family-preview.tsx for the pattern/rationale.
// Not a route meant to ship; see app/dev/family-budget-preview/page.tsx
// (404s in prod).
const MOCK_PARENT: Player = {
  ...emptyPlayer,
  name: "Wei Chen",
  role: "parent",
  familyCode: "CHEN-7K4P",
  graduationYear: 2028,
  onboarded: true,
};

export function FamilyBudgetPreview({ schools }: { schools: SchoolLite[] }) {
  return (
    <PlayerContext.Provider
      value={{
        player: MOCK_PARENT,
        isAuthed: true,
        hydrated: true,
        connectionError: null,
        retryConnection: () => {},
        beginSession: () => {},
        completeOnboarding: () => {},
        updatePlayer: () => {},
        signOut: () => {},
      }}
    >
      <SeededFamilyBudgetView schools={schools} />
    </PlayerContext.Provider>
  );
}
