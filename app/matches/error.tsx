"use client";

import { RouteError } from "@/components/shared/route-error";

export default function MatchesError({
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
      title="Couldn't load your match history."
      description="Try again to pull up your logged matches."
    />
  );
}
