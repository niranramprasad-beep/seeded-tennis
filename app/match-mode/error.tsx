"use client";

import { RouteError } from "@/components/shared/route-error";

export default function MatchModeError({
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
      title="Couldn't load match mode."
      description="Your prep tools didn't come through — try again."
    />
  );
}
