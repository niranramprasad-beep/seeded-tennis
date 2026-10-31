"use client";

import { RouteError } from "@/components/shared/route-error";

export default function SchoolDetailError({
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
      title="Couldn't load this school."
      description="Try again to see program details."
      backHref="/schools"
      backLabel="Back to schools"
    />
  );
}
