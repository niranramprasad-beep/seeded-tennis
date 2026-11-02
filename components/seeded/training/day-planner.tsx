"use client";

import { CalendarDays, Plus } from "lucide-react";
import { getType, type DayPlannerProps } from "@/components/training/training-view";
import { WEEK_ORDER } from "@/lib/training/grid-math";
import { SeededSessionCard } from "./session-card";
import { cn } from "@/lib/utils";

export function SeededDayPlanner({
  day,
  sessions,
  types,
  onDayChange,
  onAdd,
  onEdit,
  onToggle,
}: DayPlannerProps) {
  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-1.5">
        {WEEK_ORDER.map((d) => (
          <button
            key={d}
            onClick={() => onDayChange(d)}
            className={cn(
              "rounded-pill px-4 py-2 font-seeded text-sm transition-all",
              day === d ? "text-on-primary" : "text-stone hover:text-ink"
            )}
            style={
              day === d
                ? { background: "var(--s-accent-gradient)" }
                : { background: "rgb(var(--c-primary) / 0.06)" }
            }
          >
            {d}
          </button>
        ))}
      </div>
      <div className="seeded-glass rounded-[28px] p-5 shadow-seeded-1">
        <div className="flex items-center justify-between">
          <h2 className="font-seeded text-lg font-medium text-ink">{day} sessions</h2>
          <button
            onClick={() => onAdd(day)}
            className="flex items-center gap-1.5 rounded-pill px-4 py-2 font-seeded text-sm font-medium text-on-primary"
            style={{ background: "var(--s-accent-gradient)" }}
          >
            <Plus className="h-4 w-4" />
            Add session
          </button>
        </div>
        <div className="mt-4 space-y-3">
          {sessions.map((session) => (
            <SeededSessionCard
              key={session.id}
              session={session}
              type={getType(types, session.typeId)}
              onEdit={onEdit}
              onDrag={() => undefined}
              onToggle={onToggle}
            />
          ))}
          {sessions.length === 0 && (
            <div className="rounded-card border border-dashed border-[rgb(var(--c-line))] p-8 text-center">
              <CalendarDays className="mx-auto h-8 w-8 text-stone-light" />
              <p className="mt-3 font-seeded text-sm font-medium text-ink">No sessions yet</p>
              <p className="mt-1 text-sm text-stone">
                Add a tennis block, strength session, recovery day, or anything custom.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
