"use client";

import { RouteError } from "@/components/shared/route-error";

export default function RoadmapError({
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
      title="Couldn't load your roadmap."
      description="Your UTR targets and timeline didn't come through — try again."
    />
  );
}
