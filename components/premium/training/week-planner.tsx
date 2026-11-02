"use client";

import { Plus } from "lucide-react";
import { getType, type WeekPlannerProps } from "@/components/training/training-view";
import {
  WEEK_ORDER,
  GRID_START_HOUR,
  HOUR_HEIGHT,
  GRID_HOURS,
  timeToMinutes,
  minutesToTime,
  layoutOverlaps,
  dateForWeekday,
} from "@/lib/training/grid-math";
import { cn } from "@/lib/utils";

// Same drag-and-drop/positioning contract as Legacy's WeekPlanner
// (components/training/training-view.tsx) — identical draggable/
// onDragStart/onDragEnd/onDragOver/onDrop wiring and the exact same
// style={{top,height,left,width}} math from lib/training/grid-math, so
// dragging a session between days behaves identically under either skin.
// Only the visual language differs.
export function PremiumWeekPlanner(props: WeekPlannerProps) {
  const now = new Date();
  const isCurrentWeek = props.weekOffset === 0;
  const todayShort = WEEK_ORDER[(now.getDay() + 6) % 7];
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const gridTop = GRID_START_HOUR * 60;

  return (
    <div className="premium-glass overflow-x-auto rounded-[28px] shadow-premium-1">
      <div className="grid min-w-[760px] grid-cols-[52px_repeat(7,1fr)]">
        {/* header row */}
        <div />
        {WEEK_ORDER.map((day) => {
          const sessions = props.sessionsByDay.get(day) ?? [];
          const minutes = sessions.reduce((sum, s) => sum + s.duration, 0);
          const date = dateForWeekday(day, props.weekOffset);
          const isToday = isCurrentWeek && day === todayShort;
          return (
            <button
              key={day}
              onClick={() => props.onSelectDay(day)}
              className={cn(
                "flex flex-col items-center gap-1 border-l border-[rgb(var(--c-line))] px-2 py-3.5 text-center transition-colors hover:bg-[rgb(var(--c-primary)/0.06)]",
                props.selectedDay === day && "bg-[rgb(var(--c-primary)/0.08)]"
              )}
            >
              <span
                className={cn(
                  "font-premium text-[11px] font-semibold uppercase tracking-wider text-stone-light",
                  isToday && "text-grass"
                )}
              >
                {day}
              </span>
              <span
                className={cn(
                  "flex h-7 w-7 items-center justify-center rounded-full font-premium text-sm font-medium text-ink",
                  isToday && "text-on-primary"
                )}
                style={isToday ? { background: "var(--p-accent-gradient)" } : undefined}
              >
                {new Date(`${date}T00:00:00`).getDate()}
              </span>
              <span className="font-mono text-[11px] text-stone-light">{Math.round(minutes / 60)}h</span>
            </button>
          );
        })}

        {/* scrollable time grid */}
        <div className="col-span-8 max-h-[640px] overflow-y-auto">
          <div
            className="grid grid-cols-[52px_repeat(7,1fr)]"
            style={{ height: GRID_HOURS.length * HOUR_HEIGHT }}
          >
            <div className="relative">
              {GRID_HOURS.map((h) => (
                <div
                  key={h}
                  className="absolute right-2 -translate-y-1/2 font-mono text-[11px] text-stone-light"
                  style={{ top: (h - GRID_START_HOUR) * HOUR_HEIGHT }}
                >
                  {h === 12 ? "12p" : h > 12 ? `${h - 12}p` : `${h}a`}
                </div>
              ))}
            </div>

            {WEEK_ORDER.map((day) => {
              const sessions = props.sessionsByDay.get(day) ?? [];
              const placed = layoutOverlaps(sessions);
              const isToday = isCurrentWeek && day === todayShort;
              return (
                <div
                  key={day}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => props.draggingId && props.onMove(props.draggingId, day)}
                  onClick={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const offsetY = e.clientY - rect.top;
                    const minutes = gridTop + (offsetY / HOUR_HEIGHT) * 60;
                    props.onAdd(day, minutesToTime(minutes));
                  }}
                  className={cn(
                    "relative cursor-pointer border-l border-[rgb(var(--c-line))] transition-colors hover:bg-[rgb(var(--c-primary)/0.04)]",
                    isToday && "bg-[rgb(var(--c-primary)/0.05)]"
                  )}
                >
                  {GRID_HOURS.map((h) => (
                    <div
                      key={h}
                      className="absolute inset-x-0 border-t border-[rgb(var(--c-line)/0.6)]"
                      style={{ top: (h - GRID_START_HOUR) * HOUR_HEIGHT }}
                    />
                  ))}
                  {isToday && nowMinutes >= gridTop && (
                    <div
                      className="absolute inset-x-0 z-10 h-px bg-error"
                      style={{ top: ((nowMinutes - gridTop) / 60) * HOUR_HEIGHT }}
                    >
                      <span className="absolute -left-1 -top-1 h-2 w-2 rounded-full bg-error" />
                    </div>
                  )}
                  {placed.map(({ session, col, totalCols }) => {
                    const start = timeToMinutes(session.startTime);
                    const top = ((start - gridTop) / 60) * HOUR_HEIGHT;
                    const height = Math.max(22, (session.duration / 60) * HOUR_HEIGHT - 2);
                    const type = getType(props.types, session.typeId);
                    return (
                      <button
                        key={session.id}
                        draggable
                        onDragStart={(e) => {
                          e.stopPropagation();
                          props.onDrag(session.id);
                        }}
                        onDragEnd={() => props.onDrag(null)}
                        onClick={(e) => {
                          e.stopPropagation();
                          props.onEdit(session);
                        }}
                        className={cn(
                          "premium-glass absolute overflow-hidden rounded-lg px-2 py-1 text-left shadow-premium-1 transition-shadow hover:z-20 hover:shadow-premium-2",
                          session.completed && "opacity-60"
                        )}
                        style={{
                          top,
                          height,
                          left: `calc(${(col / totalCols) * 100}% + 2px)`,
                          width: `calc(${100 / totalCols}% - 4px)`,
                          borderLeft: `3px solid ${type.color}`,
                        }}
                        title={`${session.title} · ${session.startTime} · ${session.duration}m`}
                      >
                        <p className="truncate font-premium text-xs font-medium leading-tight text-ink">
                          {session.title || type.label}
                        </p>
                        {height > 34 && (
                          <p className="truncate font-mono text-[11px] leading-tight text-stone-light">
                            {session.startTime} · {session.duration}m
                          </p>
                        )}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <button
        onClick={() => props.onAdd(props.selectedDay)}
        className="flex w-full items-center justify-center gap-1.5 border-t border-[rgb(var(--c-line))] py-3 font-premium text-sm font-medium text-stone transition-colors hover:text-grass"
      >
        <Plus className="h-3.5 w-3.5" />
        Add a session
      </button>
    </div>
  );
}
