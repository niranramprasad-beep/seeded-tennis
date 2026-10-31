"use client";

import { RouteError } from "@/components/shared/route-error";

export default function CostCalculatorError({
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
      title="Couldn't load the cost calculator."
      description="Try again to run your projection."
    />
  );
}
