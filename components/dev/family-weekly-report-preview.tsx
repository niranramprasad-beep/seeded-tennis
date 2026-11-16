"use client";

import type { Player, SchoolLite } from "@/lib/types";
import { emptyPlayer } from "@/lib/data/user";
import { PlayerContext } from "@/lib/context/player-context";
import { SeededWeeklyReportView } from "@/components/seeded/family/seeded-weekly-report-view";

// Internal tool only — see family-preview.tsx for the pattern/rationale.
// Not a route meant to ship; see
// app/dev/family-weekly-report-preview/page.tsx (404s in prod).
const MOCK_PARENT: Player = {
  ...emptyPlayer,
  name: "Wei Chen",
  role: "parent",
  familyCode: "CHEN-7K4P",
  graduationYear: 2028,
  onboarded: true,
};

export function FamilyWeeklyReportPreview({ schools }: { schools: SchoolLite[] }) {
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
        updatePlayer: async () => true,
        setPlayerLocal: () => {},
        signOut: () => {},
      }}
    >
      <SeededWeeklyReportView schools={schools} />
    </PlayerContext.Provider>
  );
}
