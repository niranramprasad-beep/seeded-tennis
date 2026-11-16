"use client";

import { RouteError } from "@/components/shared/route-error";

export default function OutreachError({
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
      title="Couldn't load coach outreach."
      description="Your target schools and outreach tracking didn't come through — try again."
    />
  );
}
