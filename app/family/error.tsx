"use client";

import { RouteError } from "@/components/shared/route-error";

export default function FamilyError({
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
      title="Couldn't load the family hub."
      description="Try again to see check-ins and notes."
    />
  );
}
