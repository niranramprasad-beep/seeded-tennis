"use client";

import { useState } from "react";
import type { Player } from "@/lib/types";
import { emptyPlayer } from "@/lib/data/user";
import { PlayerContext } from "@/lib/context/player-context";
import { SeededSidebar } from "@/components/seeded/layout/sidebar";

// Internal tool only — mounts SeededSidebar with a fake PlayerContext value
// so it can be visually/pixel-checked without ever signing in through the
// real auth flow (local dev points at the same Supabase project as
// production). Not a route meant to ship; see app/dev/sidebar-preview/page.tsx
// (404s in prod).
const MOCK_PLAYER: Player = {
  ...emptyPlayer,
  name: "Maya Chen",
  currentUTR: 9.42,
  graduationYear: 2028,
  role: "player",
  onboarded: true,
};

const MOCK_PARENT: Player = {
  ...emptyPlayer,
  name: "Wei Chen",
  role: "parent",
  onboarded: true,
};

export function SidebarPreview() {
  const [role, setRole] = useState<"player" | "parent">("player");
  const player = role === "player" ? MOCK_PLAYER : MOCK_PARENT;

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
        updatePlayer: async () => true,
        signOut: () => {},
      }}
    >
      <div className="fixed left-1/2 top-2 z-[999] flex -translate-x-1/2 gap-2 rounded-full bg-ink px-3 py-1.5 text-xs text-cream shadow-lift">
        <button onClick={() => setRole("player")} className={role === "player" ? "font-bold underline" : ""}>
          player
        </button>
        <button onClick={() => setRole("parent")} className={role === "parent" ? "font-bold underline" : ""}>
          parent
        </button>
      </div>
      <SeededSidebar />
      <div className="ml-[232px] min-h-screen bg-cream p-10">
        <p className="text-stone">Preview content area.</p>
      </div>
    </PlayerContext.Provider>
  );
}
