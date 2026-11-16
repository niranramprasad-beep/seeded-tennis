"use client";

import { useState } from "react";
import type { Player, SchoolLite } from "@/lib/types";
import { emptyPlayer } from "@/lib/data/user";
import { PlayerContext } from "@/lib/context/player-context";
import { SeededSettingsView } from "@/components/seeded/settings/seeded-settings-view";

// Internal tool only — pixel-checks /settings' real Profile/Account/Family/
// Notifications/Privacy tab content without signing in through real auth
// (local dev shares production's Supabase project). A real (in-memory, not
// persisted) updatePlayer is wired up so Save changes/toggles/the delete
// dialog are all genuinely interactive here, same spirit as
// sidebar-preview.tsx's fake PlayerContext.Provider. Not a route meant to
// ship; see app/dev/settings-preview/page.tsx (404s in prod).
const MOCK_PLAYER: Player = {
  ...emptyPlayer,
  name: "Maya Chen",
  currentUTR: 10.75,
  graduationYear: 2028,
  gender: "female",
  country: "United States",
  role: "player",
  familyCode: "CHEN-8X2K",
  targetSchoolSlugs: [],
  onboarded: true,
  homeArea: "Bethesda, MD",
  utrProfileLink: "app.utrsports.net/profiles/12345",
  gpa: 3.7,
};

export function SettingsPreview({ targetSchools }: { targetSchools: SchoolLite[] }) {
  const [player, setPlayer] = useState<Player>({
    ...MOCK_PLAYER,
    targetSchoolSlugs: targetSchools.map((s) => s.slug),
  });

  return (
    <PlayerContext.Provider
      value={{
        player,
        isAuthed: true,
        hydrated: true,
        connectionError: null,
        retryConnection: () => {},
        beginSession: () => {},
        completeOnboarding: () => {},
        updatePlayer: (patch) => {
          setPlayer((prev) => ({ ...prev, ...patch }));
          return Promise.resolve(true);
        },
        setPlayerLocal: (patch) => setPlayer((prev) => ({ ...prev, ...patch })),
        signOut: () => {},
      }}
    >
      <SeededSettingsView schools={targetSchools} />
    </PlayerContext.Provider>
  );
}
