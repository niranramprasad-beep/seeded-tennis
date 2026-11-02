"use client";

import type { MonthPlannerProps } from "@/components/training/training-view";
import { WEEK_ORDER } from "@/lib/training/grid-math";
import { cn } from "@/lib/utils";

export function PremiumMonthPlanner({ sessionsByDay, onSelect }: MonthPlannerProps) {
  const now = new Date();
  const monthLabel = now.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const firstWeekday = (new Date(now.getFullYear(), now.getMonth(), 1).getDay() + 6) % 7;
  const cells: (number | null)[] = [
    ...Array(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  return (
    <div>
      <h2 className="mb-3 font-premium text-lg font-medium text-ink">{monthLabel}</h2>
      <div className="grid grid-cols-7 gap-1.5">
        {WEEK_ORDER.map((d) => (
          <div
            key={d}
            className="pb-1 text-center font-premium text-[11px] font-medium uppercase tracking-wide text-stone-light"
          >
            {d}
          </div>
        ))}
        {cells.map((date, index) => {
          if (!date) return <div key={`blank-${index}`} className="aspect-square" />;
          const day = WEEK_ORDER[(new Date(now.getFullYear(), now.getMonth(), date).getDay() + 6) % 7];
          const sessions = sessionsByDay.get(day) ?? [];
          const isToday = date === now.getDate();
          return (
            <button
              key={date}
              onClick={() => onSelect(day)}
              className={cn(
                "premium-glass flex aspect-square min-h-[74px] flex-col rounded-xl p-2 text-left transition-all hover:-translate-y-0.5 hover:shadow-premium-2",
                isToday && "shadow-premium-1"
              )}
              style={
                isToday ? { boxShadow: "var(--p-elevation-1), 0 0 0 1px rgb(var(--c-primary))" } : undefined
              }
            >
              <span className={cn("font-mono text-xs", isToday ? "font-semibold text-grass" : "text-stone")}>
                {date}
              </span>
              <div className="mt-auto flex flex-wrap gap-1">
                {sessions.slice(0, 6).map((s) => (
                  <span key={s.id} className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--p-accent-gradient)" }} />
                ))}
              </div>
              {sessions.length > 0 && (
                <span className="mt-1 font-mono text-[11px] text-stone-light">
                  {sessions.length} session{sessions.length === 1 ? "" : "s"}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
