"use client";

import type { Player, SchoolLite } from "@/lib/types";
import { emptyPlayer } from "@/lib/data/user";
import { PlayerContext } from "@/lib/context/player-context";
import { SeededFamilyOverview } from "@/components/seeded/family/seeded-family-overview";

// Internal tool only — pixel-checks /family's real Seeded Overview without
// signing in through the real auth flow (local dev points at the same
// Supabase project as production — see sidebar-preview.tsx for the same
// pattern). Mounting PlayerContext.Provider directly also means AuthGate
// never runs, so this renders even though the account actually signed in
// locally (if any) might not be a parent. The underlying load*() calls
// still hit the real, authenticated Supabase session (PlayerContext only
// fakes what usePlayer() itself returns) — so real numbers on screen come
// from whatever account is actually signed in locally, not from
// MOCK_PARENT below; this harness is for layout/visual verification, not
// a literal data match. Not a route meant to ship; see
// app/dev/family-preview/page.tsx (404s in prod).
const MOCK_PARENT: Player = {
  ...emptyPlayer,
  name: "Wei Chen",
  role: "parent",
  familyCode: "CHEN-7K4P",
  graduationYear: 2028,
  onboarded: true,
};

export function FamilyPreview({ schools }: { schools: SchoolLite[] }) {
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
      <SeededFamilyOverview schools={schools} />
    </PlayerContext.Provider>
  );
}
