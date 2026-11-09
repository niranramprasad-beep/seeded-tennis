"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { WeekdayShort } from "@/lib/types";
import type { TrainingPlannerSession, TrainingSessionType } from "@/lib/supabase/training";
import type { TournamentEntry } from "@/lib/supabase/tournaments";
import { getType } from "@/components/training/training-view";
import { WEEK_ORDER } from "@/lib/training/grid-math";
import { localDateKey } from "@/lib/time";
import { cn } from "@/lib/utils";

// The real month planner (components/seeded/training/month-planner.tsx),
// restyled narrower for this column: text session-type labels instead of
// dots, plus month navigation that planner never needed. Sessions are a
// recurring weekly template (not a dated log — see lib/supabase/
// training.ts's header comment), so like the existing month planner this
// repeats the same weekly pattern across every week shown, now across
// whichever month is navigated to. Tournament entries (lib/supabase/
// tournaments.ts) ARE dated, so those overlay on their real calendar day.
export function EventsCalendarCard({
  sessions,
  sessionTypes,
  tournamentEntries,
}: {
  sessions: TrainingPlannerSession[];
  sessionTypes: TrainingSessionType[];
  tournamentEntries: TournamentEntry[];
}) {
  const [monthOffset, setMonthOffset] = useState(0);
  const today = useMemo(() => new Date(), []);
  const viewDate = new Date(today.getFullYear(), today.getMonth() + monthOffset, 1);
  const monthLabel = viewDate.toLocaleDateString("en-US", { month: "long" });

  const sessionsByDay = useMemo(() => {
    const map = new Map<WeekdayShort, TrainingPlannerSession[]>();
    WEEK_ORDER.forEach((d) => map.set(d, []));
    sessions.forEach((s) => map.get(s.day)?.push(s));
    return map;
  }, [sessions]);

  const tournamentsByDate = useMemo(() => {
    const map = new Map<string, TournamentEntry[]>();
    tournamentEntries.forEach((t) => {
      const key = t.eventDate.slice(0, 10);
      map.set(key, [...(map.get(key) ?? []), t]);
    });
    return map;
  }, [tournamentEntries]);

  const daysInMonth = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 0).getDate();
  const firstWeekday = (new Date(viewDate.getFullYear(), viewDate.getMonth(), 1).getDay() + 6) % 7;
  const cells: (number | null)[] = [
    ...Array(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  return (
    <div className="rounded-xl border border-line bg-card p-5">
      <div className="flex items-center justify-between">
        <h2 className="font-seeded text-lg font-semibold text-ink">{monthLabel}</h2>
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={() => setMonthOffset((v) => v - 1)}
            aria-label="Previous month"
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-line text-stone transition-colors hover:text-ink focus:outline-none focus:ring-2 focus:ring-grass/30"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setMonthOffset((v) => v + 1)}
            aria-label="Next month"
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-line text-stone transition-colors hover:text-ink focus:outline-none focus:ring-2 focus:ring-grass/30"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-7 gap-1.5">
        {WEEK_ORDER.map((d) => (
          <div key={d} className="text-center text-[11px] font-medium uppercase tracking-wide text-stone-light">
            {d}
          </div>
        ))}
        {cells.map((date, index) => {
          if (!date) return <div key={`blank-${index}`} />;
          const cellDate = new Date(viewDate.getFullYear(), viewDate.getMonth(), date);
          const day = WEEK_ORDER[(cellDate.getDay() + 6) % 7];
          const daySessions = sessionsByDay.get(day) ?? [];
          const dayTournaments = tournamentsByDate.get(localDateKey(cellDate)) ?? [];
          const isToday = monthOffset === 0 && date === today.getDate();

          return (
            <div
              key={date}
              className={cn(
                "flex min-h-[64px] flex-col gap-1 rounded-lg border p-1.5",
                isToday ? "border-grass" : "border-line"
              )}
            >
              <span className={cn("text-xs", isToday ? "font-semibold text-grass" : "text-stone")}>{date}</span>
              {dayTournaments.slice(0, 1).map((t) => (
                <span
                  key={t.id}
                  title={t.name}
                  className="line-clamp-2 rounded px-1 py-0.5 text-[10px] font-semibold leading-tight text-ink"
                  style={{ background: "rgb(var(--c-tennis) / 0.55)" }}
                >
                  {t.name.split(" ")[0]}
                </span>
              ))}
              {daySessions.slice(0, 2).map((s) => {
                const type = getType(sessionTypes, s.typeId);
                return (
                  <span
                    key={s.id}
                    title={s.title || type.label}
                    className={cn(
                      "line-clamp-2 rounded px-1 py-0.5 text-[10px] font-medium leading-tight",
                      type.bg,
                      type.text
                    )}
                  >
                    {s.title || type.label}
                  </span>
                );
              })}
            </div>
          );
        })}
      </div>

      <p className="mt-3 text-xs text-stone">
        Your own sessions. Add or remove anything, and nothing is auto-planned.
      </p>
    </div>
  );
}
