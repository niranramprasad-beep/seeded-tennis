"use client";

import { RouteError } from "@/components/shared/route-error";

export default function SchoolsError({
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
      title="Couldn't load schools."
      description="Try again to browse the catalog."
    />
  );
}
