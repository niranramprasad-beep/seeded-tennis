"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useDesign } from "@/lib/context/design-context";

// Phase 3 of the redesign moved Seeded's IA onto new routes (e.g. /dashboard
// -> /today), but Legacy keeps its old routes and separate Training/
// Match-mode pages untouched. There's no server-visible signal for which
// design a visitor has chosen (only client localStorage via useDesign()), so
// this can't be a next.config.js redirect or middleware — it has to resolve
// client-side, same as every other conditional redirect in this app
// (AuthGate, AuthedHomeRedirect). Mount this wrapping a legacy route's
// existing content: Legacy users see `children` exactly as before: Seeded
// users get bounced to `to` once design is known, never flashing the old
// page first.
export function SeededRouteRedirect({ to, children }: { to: string; children: ReactNode }) {
  const { design, hydrated } = useDesign();
  const router = useRouter();

  useEffect(() => {
    if (!hydrated || design !== "seeded") return;
    router.replace(to);
  }, [hydrated, design, to, router]);

  if (!hydrated) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <span
          className="h-8 w-8 animate-spin rounded-full border-2 border-line border-t-grass"
          aria-hidden
        />
      </div>
    );
  }

  if (design === "seeded") return null;

  return <>{children}</>;
}
