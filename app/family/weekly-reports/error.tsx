"use client";

import { RouteError } from "@/components/shared/route-error";

export default function FamilyWeeklyReportsError({
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
      title="Couldn't load this week's report."
      description="Try again to see UTR movement, coach activity, and upcoming events."
      backHref="/family"
      backLabel="Back to overview"
    />
  );
}
