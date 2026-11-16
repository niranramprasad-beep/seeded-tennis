"use client";

import { RouteError } from "@/components/shared/route-error";

export default function FamilyBudgetError({
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
      title="Couldn't load the season budget."
      description="Try again to see spend, expenses, and the cost projection."
      backHref="/family"
      backLabel="Back to overview"
    />
  );
}
