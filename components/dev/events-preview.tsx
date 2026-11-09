"use client";

import type { Player } from "@/lib/types";
import { emptyPlayer } from "@/lib/data/user";
import { PlayerContext } from "@/lib/context/player-context";
import { SeededEventsView } from "@/components/seeded/events/seeded-events-view";

// Internal tool only — Phase 5 QA harness, same mock-PlayerContext pattern as
// components/dev/sidebar-preview.tsx. Not a route meant to ship; see
// app/dev/events-preview/page.tsx (404s in prod).
const MOCK_PLAYER: Player = {
  ...emptyPlayer,
  name: "Maya Chen",
  currentUTR: 9.42,
  graduationYear: 2028,
  role: "player",
  onboarded: true,
};

export function EventsPreview() {
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
        updatePlayer: () => {},
        signOut: () => {},
      }}
    >
      <SeededEventsView plans={[]} />
    </PlayerContext.Provider>
  );
}
