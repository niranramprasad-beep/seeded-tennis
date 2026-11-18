"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { seededButtonVariants } from "@/components/seeded/ui/button";
import { EstimateChip } from "@/components/seeded/ui/data-note";
import { DashboardBody } from "./dashboard-body";
import { sampleParentDashboard } from "./sample-model";
import * as L from "./layout";

// B4, the app side of the Family-plan paywall. A calm page, never an error:
// what Family adds, one green button, and a static preview of Board 22 with
// sample numbers clearly marked "Example".
//
// Not the control. RLS refuses the family's budget, notes, reports and the
// parent's reads of their player's rows without a Family plan; this page is
// what a locked family sees INSTEAD of a dashboard of empty cards. Nothing
// is deleted — upgrading brings the same page back with everything in it.
// The callers never start the budget/notes loaders while locked, and the
// preview's controls are inert, so neither "Send a note" nor budget editing
// is reachable from here.

export type PaywallPage = "overview" | "budget" | "weekly";

const HEADLINE: Record<PaywallPage, (child: string | null) => string> = {
  overview: (c) => (c ? `Follow ${c}'s season` : "Follow your player's season"),
  budget: () => "The season budget is part of Family",
  weekly: () => "Weekly reports are part of Family",
};

export function FamilyPlanPaywall({ page, childFirst }: { page: PaywallPage; childFirst: string | null }) {
  const sample = sampleParentDashboard();
  // `inert` takes the preview's one link ("About our data") out of the tab
  // order too. Set by hand: React 18 does not pass the attribute through.
  const inertRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    inertRef.current?.setAttribute("inert", "");
  }, []);
  return (
    <div key="family-paywall" className={L.PAGE}>
      <div className={L.HEADER}>
        <div className="min-w-0">
          <p className={L.EYEBROW}>Family plan</p>
          <h1 className={L.H1}>{HEADLINE[page](childFirst)}</h1>
          <p className={cn(L.PILL_ROW, "max-w-2xl text-[15px] text-stone")}>
            Family adds a read-only parent dashboard, the season budget and a weekly family report, for everyone in
            your family.
          </p>
        </div>
        <div className="flex flex-wrap gap-2.5">
          <Link href="/schools" className={seededButtonVariants({ variant: "secondary" })}>
            Back to schools
          </Link>
          <Link href="/pricing" className={seededButtonVariants({ variant: "primary" })}>
            Choose Family
          </Link>
        </div>
      </div>

      <section aria-label="Example of the parent dashboard" className="relative mt-10 rounded-2xl border border-dashed border-input p-4 sm:p-6">
        <p className="mb-4 flex flex-wrap items-center gap-2 text-sm text-stone">
          <EstimateChip label="Example" />
          Sample numbers, to show what you&rsquo;d see. Not your family&rsquo;s.
        </p>
        {/* Sample data is never read out as if it were real. */}
        <div ref={inertRef} aria-hidden className="pointer-events-none select-none [&_*]:!cursor-default">
          <DashboardBody model={sample} eyebrow="Example" preview canEditBudget seasonLabel="Fall 2026" />
        </div>
      </section>
    </div>
  );
}
