"use client";

import { RouteError } from "@/components/shared/route-error";

export default function TournamentFitError({
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
      title="Couldn't load tournament fit."
      description="Try again to check which events are worth entering."
    />
  );
}
