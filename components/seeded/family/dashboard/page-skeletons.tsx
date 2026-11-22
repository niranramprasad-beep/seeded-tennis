import Link from "next/link";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/seeded/ui/empty-state";

// Loading states for /family/budget and /family/weekly-reports, box for box
// with each page's final layout, rendered by the route's loading.tsx,
// AuthGate's wait and the page's own data wait alike. Server-safe.
//
// /family/budget measured CLS 0.058 at 1440 in PR A: the page drew as soon
// as the roster answered, then the budget, the expenses and the entered
// tournaments each arrived and grew the card, pushing the projection section
// down inside the viewport. The page now waits for all of them behind this
// skeleton and draws once.

const bar = "animate-pulse rounded-md bg-line/60 motion-reduce:animate-none";

function ScopeLineBox() {
  return <div className="min-h-[46px] rounded-lg border border-line bg-card" />;
}

export function BudgetPageSkeleton() {
  return (
    <div key="budget-skeleton" className="mx-auto max-w-content container-px py-10" aria-busy="true">
      <p className="sr-only" role="status">
        Loading the season budget…
      </p>
      <div aria-hidden>
        <ScopeLineBox />
        <div className="h-6" />
        <div className="flex h-10 items-center">
          <div className={cn("h-8 w-52", bar)} />
        </div>
        <div className={cn("mt-1.5 h-12 max-w-2xl", bar)} />
        <div className="mt-6 min-h-[300px] rounded-card border border-line bg-card p-6">
          <div className={cn("h-6 w-60", bar)} />
          <div className={cn("mt-6 h-2.5 w-full", bar)} />
          <div className={cn("mt-6 h-4 w-3/4", bar)} />
          <div className={cn("mt-4 h-4 w-2/3", bar)} />
        </div>
      </div>
    </div>
  );
}

export function WeeklyReportSkeleton() {
  return (
    <div key="weekly-skeleton" className="mx-auto max-w-content container-px py-10" aria-busy="true">
      <p className="sr-only" role="status">
        Loading this week&rsquo;s report…
      </p>
      <div aria-hidden>
        <ScopeLineBox />
        <div className="h-6" />
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="flex h-10 items-center">
              <div className={cn("h-8 w-48", bar)} />
            </div>
            <div className={cn("mt-1.5 h-6 w-56", bar)} />
          </div>
          <div className={cn("h-11 w-44 rounded-lg", bar)} />
        </div>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="min-h-[104px] rounded-card border border-line bg-card p-5">
              <div className={cn("h-8 w-20", bar)} />
              <div className={cn("mt-2 h-4 w-32", bar)} />
            </div>
          ))}
        </div>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div className="min-h-[180px] rounded-card border border-line bg-card" />
          <div className="min-h-[180px] rounded-card border border-line bg-card" />
        </div>
      </div>
    </div>
  );
}

/** /family/budget or /family/weekly-reports opened before the parent is in
 *  a family: the join flow lives on /family. */
export function NoFamilyYet() {
  return (
    <div className="mx-auto max-w-content container-px py-10">
      <h1 className="font-seeded text-[32px] font-bold leading-tight tracking-tight text-ink">Your family</h1>
      <EmptyState
        className="mt-6 max-w-xl"
        title="You're not in a family yet."
        description="Join with a family code, or wait for a request to be approved."
      />
      <Link href="/family" className="mt-4 inline-flex min-h-11 items-center text-sm font-semibold text-grass sm:min-h-6">
        Go to your family page
      </Link>
    </div>
  );
}
