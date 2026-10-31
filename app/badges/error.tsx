"use client";

import { RouteError } from "@/components/shared/route-error";

export default function BadgesError({
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
      title="Couldn't load your badges."
      description="Try again to see what you've earned."
    />
  );
}
