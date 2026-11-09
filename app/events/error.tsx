"use client";

import { RouteError } from "@/components/shared/route-error";

export default function EventsError({
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
      title="Couldn't load Events."
      description="Your training plan and match prep didn't come through — try again."
    />
  );
}
