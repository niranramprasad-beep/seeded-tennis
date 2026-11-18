"use client";

import type { SchoolLite } from "@/lib/types";
import type { DiagnosticAnswers } from "@/lib/onboarding/diagnostic";
import { useDesign } from "@/lib/context/design-context";
import { usePlayer } from "@/lib/context/player-context";
import { AuthGate } from "@/components/shared/auth-gate";
import { OnboardingFlow } from "@/components/onboarding/onboarding-flow";
import { SeededDiagnosticOnboarding } from "@/components/seeded/onboarding/diagnostic/diagnostic-flow";

// Legacy's /onboarding is completely untouched: always AuthGate-wrapped,
// exactly as before this redesign. Seeded gets the public, pre-auth
// diagnostic (board 20) — nine questions, a result, a fit report and an
// inline sign-up that keeps every answer.
//
// A signed-in visitor is unchanged: once the session check says "signed
// in", this falls through to the existing OnboardingFlow under AuthGate,
// which redirects a parent to /family and leaves a player on the in-app
// setup, exactly as before.
//
// Render the diagnostic BEFORE the session check too, not only once it has
// said "signed out". The server has no session, so it used to render the
// AuthGate branch — whose pre-hydration state is a spinner — and a crawler
// that does not run JavaScript saw a spinner on the top of the funnel
// (sitemap priority 0.9). A signed-in user sees the first question for the
// length of the session check before the continuation replaces it.
export function OnboardingPageSwitch({
  schools,
  initialAnswers,
  prefilled,
}: {
  schools: SchoolLite[];
  initialAnswers?: DiagnosticAnswers;
  prefilled?: number[];
}) {
  const { design } = useDesign();
  const { isAuthed, hydrated } = usePlayer();

  if (design === "seeded" && (!hydrated || !isAuthed)) {
    return (
      <SeededDiagnosticOnboarding schools={schools} initialAnswers={initialAnswers} prefilled={prefilled} />
    );
  }

  return (
    <AuthGate>
      <OnboardingFlow schools={schools} />
    </AuthGate>
  );
}
