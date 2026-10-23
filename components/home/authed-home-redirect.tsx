"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { usePlayer } from "@/lib/context/player-context";

// The marketing homepage is public (no AuthGate), so a signed-in visitor
// could otherwise land on it and see signup CTAs for an account they
// already have. Bounce them to their real workspace instead — same
// player/parent split used everywhere else (login-form, AuthGate). Renders
// nothing; if the destination page itself needs an onboarding redirect,
// its own AuthGate already handles that, so this doesn't duplicate that
// check.
export function AuthedHomeRedirect() {
  const { isAuthed, hydrated, player } = usePlayer();
  const router = useRouter();

  useEffect(() => {
    if (!hydrated || !isAuthed) return;
    router.replace(player.role === "parent" ? "/family" : "/dashboard");
  }, [hydrated, isAuthed, player.role, router]);

  return null;
}
