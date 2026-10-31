"use client";

import { RouteError } from "@/components/shared/route-error";

export default function FriendsError({
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
      title="Couldn't load friends."
      description="Try again to see your friends and requests."
    />
  );
}
