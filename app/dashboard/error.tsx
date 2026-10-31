"use client";

import { RouteError } from "@/components/shared/route-error";

export default function DashboardError({
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
      title="Couldn't load your dashboard."
      description="That's on us — try again, or check back in a moment."
      backHref="/"
      backLabel="Back home"
    />
  );
}
