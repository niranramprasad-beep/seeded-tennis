"use client";

import type { SchoolLite } from "@/lib/types";
import { useDesign } from "@/lib/context/design-context";
import { usePlayer } from "@/lib/context/player-context";
import { AuthGate } from "@/components/shared/auth-gate";
import { OnboardingFlow } from "@/components/onboarding/onboarding-flow";
import { SeededPreAuthOnboarding } from "@/components/seeded/onboarding/seeded-pre-auth-onboarding";

// Legacy's /onboarding is completely untouched: always AuthGate-wrapped,
// exactly as before this redesign. Seeded gets the new public, pre-auth fit
// report + inline signup — but only once we're sure the visitor really is
// unauthenticated (while player-context is still hydrating, default to the
// existing gated flow, which already renders its own loading state; this
// avoids ever flashing the wrong branch). Once a Seeded visitor signs up
// through the new flow, they become authenticated and this same route
// naturally falls through to the existing OnboardingFlow (target schools,
// weaknesses) for the rest of the in-app setup — unchanged for either design.
export function OnboardingPageSwitch({ schools }: { schools: SchoolLite[] }) {
  const { design } = useDesign();
  const { isAuthed, hydrated } = usePlayer();

  // Render the free fit report BEFORE the session check too, not only once
  // it has said "signed out". The server has no session, so it used to
  // render the AuthGate branch — whose pre-hydration state is a spinner —
  // and a crawler that does not run JavaScript saw a spinner on the top of
  // the funnel (sitemap priority 0.9). A signed-in user sees the form for
  // the length of the session check before the continuation replaces it.
  if (design === "seeded" && (!hydrated || !isAuthed)) {
    return <SeededPreAuthOnboarding schools={schools} />;
  }

  return (
    <AuthGate>
      <OnboardingFlow schools={schools} />
    </AuthGate>
  );
}
