"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RotateCw } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";

// App Router's error boundary for any uncaught render/render-path error.
// Matches not-found.tsx's layout and uses the same error-state visual
// language as AuthGate's connection-error screen (error-bg/error tokens,
// AlertTriangle) so a thrown error doesn't fall through to Next's bare
// default screen.
export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-5 py-28 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-error-bg text-error">
        <AlertTriangle className="h-6 w-6" />
      </span>
      <h1 className="mt-4 text-2xl font-light text-ink">Something went wrong.</h1>
      <p className="mt-2 text-stone">
        That&rsquo;s on us — try again, or head back and pick up where you left off.
      </p>
      <div className="mt-7 flex gap-3">
        <Button variant="primary" size="md" onClick={reset}>
          <RotateCw className="h-4 w-4" />
          Try again
        </Button>
        <Link href="/" className={buttonVariants({ variant: "outline", size: "md" })}>
          Back home
        </Link>
      </div>
    </div>
  );
}
