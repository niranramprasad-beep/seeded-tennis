"use client";

import { RouteError } from "@/components/shared/route-error";

export default function SettingsError({
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
      title="Couldn't load settings."
      description="Try again to manage your account."
    />
  );
}
