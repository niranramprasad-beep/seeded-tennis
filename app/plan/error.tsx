"use client";

import { RouteError } from "@/components/shared/route-error";

export default function PlanError({
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
      title="Couldn't load your plan."
      description="Your UTR targets and timeline didn't come through — try again."
    />
  );
}
