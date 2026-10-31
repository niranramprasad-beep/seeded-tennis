"use client";

import { RouteError } from "@/components/shared/route-error";

export default function TrainingError({
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
      title="Couldn't load your training plan."
      description="Your plan and sessions didn't come through — try again."
    />
  );
}
