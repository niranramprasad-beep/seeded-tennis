"use client";

import { RouteError } from "@/components/shared/route-error";

export default function OnboardingError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <RouteError
      error={error}
      reset={reset}
      title="Couldn't load onboarding."
      description="Try again to finish setting up your profile."
      backHref="/"
      backLabel="Back home"
    />
  );
}
