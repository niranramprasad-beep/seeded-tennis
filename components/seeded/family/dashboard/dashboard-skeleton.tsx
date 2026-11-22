import { cn } from "@/lib/utils";
import * as L from "./layout";

// /family's loading state: the dashboard's own boxes, empty. Used by EVERY
// stage that can show before the page — the route's loading.tsx, AuthGate
// while the session resolves, and the overview while the family, the plan
// and the child's rows load — so moving from one stage to the next changes
// nothing on screen, and the page that replaces it lands in the same boxes.
//
// That is the fix for the two parent-only CLS cases PR A measured on /family
// (0.058, intermittent, on redirects into it): the redirect chain used to
// show a 60vh spinner, then a three-block skeleton, then a page whose cards
// each filled in on their own schedule. Server-safe: no hooks, so
// app/family/loading.tsx can render it too.

const bar = "animate-pulse rounded-md bg-line/60 motion-reduce:animate-none";

export function FamilyDashboardSkeleton({ label = "Loading your family…" }: { label?: string }) {
  return (
    <div key="family-dashboard-skeleton" className={L.PAGE} aria-busy="true">
      <p className="sr-only" role="status">
        {label}
      </p>
      <div aria-hidden>
        <div className={L.HEADER}>
          <div className="min-w-0">
            <div className={cn(L.EYEBROW, "w-40", bar)} />
            <div className="flex h-9 items-center sm:h-10">
              <div className={cn("h-7 w-72 max-w-full", bar)} />
            </div>
            <div className={L.PILL_ROW}>
              <div className={cn("h-8 w-56 rounded-pill", bar)} />
            </div>
          </div>
          <div className={cn("h-11 w-44 rounded-lg", bar)} />
        </div>

        <div className={L.KPI_ROW}>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className={L.KPI_CARD}>
              {/* Icon tile + label row (28px), as KpiCard draws it. */}
              <div className="flex items-center gap-2">
                <div className={cn("h-7 w-7 rounded-lg", bar)} />
                <div className={cn("h-3 w-20", bar)} />
              </div>
              <div className={cn("mt-2 h-8 w-24", bar)} />
              <div className={cn("mt-auto h-4 w-36", bar)} />
            </div>
          ))}
        </div>

        <div className={L.CHART_CARD}>
          <div className={L.CHART_HEAD}>
            <div className={cn("h-5 w-28", bar)} />
            <div className={cn("h-4 w-60", bar)} />
          </div>
          <div className={cn(L.CHART_PLOT, "rounded-lg bg-line/30")} />
          <div className={L.CHART_FOOT}>
            <div className={cn("h-4 w-full max-w-lg", bar)} />
          </div>
        </div>

        <div className={L.GRID}>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className={L.GRID_CARD}>
              <div className={cn("h-5 w-36", bar)} />
              <div className={cn("mt-5 h-3 w-full", bar)} />
              <div className={cn("mt-4 h-3 w-5/6", bar)} />
              <div className={cn("mt-4 h-3 w-2/3", bar)} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
