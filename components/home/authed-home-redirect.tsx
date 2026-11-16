"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { usePlayer } from "@/lib/context/player-context";
import { useDesign } from "@/lib/context/design-context";

// The marketing homepage is public (no AuthGate), so a signed-in visitor
// could otherwise land on it and see signup CTAs for an account they
// already have. Bounce them to their real workspace instead — same
// player/parent split used everywhere else (login-form, AuthGate). Renders
// nothing; if the destination page itself needs an onboarding redirect,
// its own AuthGate already handles that, so this doesn't duplicate that
// check.
//
// Player destination is design-aware: Seeded players land on the new /today
// (Phase 3's IA), Legacy players keep landing on /dashboard exactly as
// before. Parents always land on /family — nothing in the redesign changes
// that.
export function AuthedHomeRedirect() {
  const { isAuthed, hydrated, player } = usePlayer();
  const { design, hydrated: designHydrated } = useDesign();
  const router = useRouter();

  useEffect(() => {
    if (!hydrated || !isAuthed || !designHydrated) return;
    if (player.role === "parent") {
      router.replace("/family");
    } else {
      router.replace(design === "seeded" ? "/today" : "/dashboard");
    }
  }, [hydrated, isAuthed, player.role, design, designHydrated, router]);

  return null;
}
