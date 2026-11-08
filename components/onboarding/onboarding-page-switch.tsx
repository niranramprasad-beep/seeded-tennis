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

  if (design === "seeded" && hydrated && !isAuthed) {
    return <SeededPreAuthOnboarding schools={schools} />;
  }

  return (
    <AuthGate>
      <OnboardingFlow schools={schools} />
    </AuthGate>
  );
}
