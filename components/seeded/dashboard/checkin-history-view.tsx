"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { AuthGate } from "@/components/shared/auth-gate";
import { SeededButton } from "@/components/seeded/ui/button";
import { EmptyState } from "@/components/seeded/ui/empty-state";
import { calculateStreak, loadDailyCheckins, type DailyCheckin } from "@/lib/db/plan";
import { formatDate } from "@/lib/time";
import { plural } from "@/lib/utils";
import { CheckinHeatmap, MOOD_CLASS } from "./checkin-heatmap";
import { CheckinDrawer, FOCUS_LABEL } from "./checkin-drawer";

const HISTORY_DAYS = 84; // twelve weeks

// Where Today's "Check-in history" link goes. It used to point at /events,
// which has no check-ins on it. Real rows only: the daily_checkins the
// player saved, newest first, with a twelve-week heatmap above them.
export function CheckinHistoryView() {
  return (
    <AuthGate>
      <CheckinHistoryInner />
    </AuthGate>
  );
}

function CheckinHistoryInner() {
  const { data: checkins } = useSWR<DailyCheckin[]>(`daily-checkins-${HISTORY_DAYS}`, () =>
    loadDailyCheckins("self", undefined, HISTORY_DAYS)
  );
  const [drawerOpen, setDrawerOpen] = useState(false);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);
  const newestFirst = useMemo(() => [...(checkins ?? [])].sort((a, b) => b.date.localeCompare(a.date)), [checkins]);
  const streak = useMemo(() => calculateStreak(checkins ?? []), [checkins]);

  return (
    <div className="mx-auto max-w-content container-px py-10">
      <Link href="/today" className="inline-flex min-h-11 items-center text-sm font-semibold text-grass underline sm:min-h-6">
        Back to Today
      </Link>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[30px] font-semibold tracking-tight text-ink">Check-ins</h1>
          <p className="mt-1.5 text-stone">
            {checkins === undefined
              ? "Your daily check-ins."
              : `${plural(checkins.length, "check-in", "check-ins")} in the last 12 weeks${
                  streak > 0 ? ` · ${plural(streak, "day", "days")} in a row` : ""
                }`}
          </p>
        </div>
        <SeededButton onClick={() => setDrawerOpen(true)} className="w-full sm:w-auto">
          Log check-in
        </SeededButton>
      </div>

      <section aria-labelledby="heatmap-heading" className="mt-6 rounded-card border border-line bg-card p-5">
        <h2 id="heatmap-heading" className="text-lg font-semibold text-ink">
          Last 12 weeks
        </h2>
        {checkins === undefined ? (
          <div className="mt-4 aspect-[12/7] w-full max-w-xl animate-pulse rounded-md bg-line/50 motion-reduce:animate-none" aria-hidden />
        ) : (
          <CheckinHeatmap checkins={checkins} days={HISTORY_DAYS} columns={12} className="mt-4 max-w-xl" />
        )}
      </section>

      <section aria-labelledby="list-heading" className="mt-5">
        <h2 id="list-heading" className="text-lg font-semibold text-ink">
          Every check-in
        </h2>
        {checkins !== undefined && newestFirst.length === 0 ? (
          <EmptyState className="mt-3" title="No check-ins yet." description="Log one after training and it shows here." />
        ) : (
          <ul className="mt-3 flex flex-col gap-2.5">
            {checkins === undefined &&
              [0, 1, 2].map((i) => (
                <li key={i} aria-hidden className="h-[72px] animate-pulse rounded-xl border border-line bg-line/40 motion-reduce:animate-none" />
              ))}
            {newestFirst.map((c) => (
              <li key={c.id} className="flex gap-3 rounded-card border border-line bg-card p-4">
                <span className={`mt-1 h-4 w-4 shrink-0 rounded-[4px] ${MOOD_CLASS[c.mood] ?? ""}`} aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-baseline gap-x-2 text-ink">
                    <span className="font-semibold">{formatDate(c.date)}</span>
                    <span className="text-sm text-stone">Mood {c.mood} of 5</span>
                  </p>
                  {c.focusAreas.length > 0 && (
                    <p className="mt-1 text-sm text-stone">
                      Worked on: {c.focusAreas.map((f) => FOCUS_LABEL.get(f) ?? f).join(", ")}
                    </p>
                  )}
                  {c.notes && <p className="mt-1.5 whitespace-pre-line break-words text-sm text-ink">{c.notes}</p>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <CheckinDrawer open={drawerOpen} onClose={closeDrawer} />
    </div>
  );
}
