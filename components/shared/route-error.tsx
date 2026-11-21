"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RotateCw } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";

// Shared body for every route's error.tsx — same visual language as the
// root app/error.tsx (error-bg/error tokens, AlertTriangle, "Try again"),
// just with a route-specific message and a safe link back to a known-good
// page. Keeping the error boundary PER ROUTE (instead of relying only on
// the root one) means a failure in one tab never has to tear down and
// reset every other route's state — only this one segment resets.
//
// backHref/backLabel default to /today, the player's home — a page that
// won't itself immediately redirect them again.
export function RouteError({
  error,
  reset,
  title = "Something went wrong.",
  description = "That's on us — try again, or head back to your dashboard.",
  backHref,
  backLabel,
}: {
  error: Error & { digest?: string };
  reset: () => void;
  title?: string;
  description?: string;
  backHref?: string;
  backLabel?: string;
}) {
  const resolvedHref = backHref ?? "/today";
  const resolvedLabel = backLabel ?? "Back to Today";

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-5 py-24 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-error-bg text-error">
        <AlertTriangle className="h-6 w-6" />
      </span>
      <h1 className="mt-4 text-2xl font-light text-ink">{title}</h1>
      <p className="mt-2 text-stone">{description}</p>
      <div className="mt-7 flex gap-3">
        <Button variant="primary" size="md" onClick={reset}>
          <RotateCw className="h-4 w-4" />
          Try again
        </Button>
        <Link href={resolvedHref} className={buttonVariants({ variant: "outline", size: "md" })}>
          {resolvedLabel}
        </Link>
      </div>
    </div>
  );
}
