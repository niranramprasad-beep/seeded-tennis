"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import type { WeekdayShort } from "@/lib/types";
import type { TrainingPlannerSession, TrainingSessionType } from "@/lib/supabase/training";
import type { TournamentEntry } from "@/lib/supabase/tournaments";
import { getType } from "@/components/training/training-view";
import {
  WEEK_ORDER,
  GRID_START_HOUR,
  GRID_END_HOUR,
  HOUR_HEIGHT,
  GRID_HOURS,
  timeToMinutes,
  layoutOverlaps,
  dateForWeekday,
} from "@/lib/training/grid-math";
import { startTimeFromPointer, resizedDuration } from "@/lib/training/calendar-interactions";
import { localDateKey } from "@/lib/time";
import type { AddSessionInput, SessionFormValues } from "@/lib/hooks/use-events-calendar";
import { SessionFormModal, type SessionFormResult } from "./session-form-modal";
import { cn } from "@/lib/utils";

export interface EventsCalendarCardProps {
  sessions: TrainingPlannerSession[];
  sessionTypes: TrainingSessionType[];
  tournamentEntries: TournamentEntry[];
  onAddSession: (input: AddSessionInput) => void;
  onUpdateSession: (id: string, values: SessionFormValues, weekOffset: number) => void;
  onMoveSession: (id: string, day: WeekdayShort, startTime: string, weekOffset: number) => void;
  onResizeSession: (id: string, duration: number) => void;
  onDeleteSession: (session: TrainingPlannerSession, scope: "one" | "series") => void;
}

type CalendarView = "week" | "month";

// Week view is the real, interactive calendar (add/edit/delete/drag/resize/
// repeat — see lib/hooks/use-events-calendar.ts for the real Supabase-backed
// CRUD every one of those calls into). Month view keeps the ORIGINAL month
// card's architecture unchanged: training sessions are still a recurring
// weekday template shown on every month regardless of real date (see the
// header comment that used to live on this file, now on <MonthGrid>) —
// only the visual treatment changed, from up-to-2 truncated title pills to
// compact colored dots + a count, per this task's spec. Week view is
// deliberately NOT built on that same "ignore the real date" template:
// dragging a session to a new day/time, and the bounded "repeat weekly"
// option, only make sense against real, individual calendar dates, so week
// view filters/positions every session by its actual stored `date` for
// whichever real week is being viewed (dateForWeekday(day, weekOffset)).
// Tournament entries were always real-dated, so they're unaffected either
// way and still only appear in month view here (the same real fit-checked
// list the "Upcoming tournaments" card above already renders in full).
export function EventsCalendarCard({
  sessions,
  sessionTypes,
  tournamentEntries,
  onAddSession,
  onUpdateSession,
  onMoveSession,
  onResizeSession,
  onDeleteSession,
}: EventsCalendarCardProps) {
  const [view, setView] = useState<CalendarView>("week");
  const [weekOffset, setWeekOffset] = useState(0);
  const [monthOffset, setMonthOffset] = useState(0);
  const [modal, setModal] = useState<{ session: TrainingPlannerSession | null; day: WeekdayShort; time?: string } | null>(
    null
  );

  const openAdd = (day: WeekdayShort, time?: string) => setModal({ session: null, day, time });
  const openEdit = (session: TrainingPlannerSession) => setModal({ session, day: session.day, time: session.startTime });
  const closeModal = () => setModal(null);

  const handleSave = (values: SessionFormResult) => {
    if (modal?.session) {
      onUpdateSession(modal.session.id, values, weekOffset);
    } else {
      onAddSession({ ...values, weekOffset });
    }
    closeModal();
  };

  const handleDelete = (scope: "one" | "series") => {
    if (modal?.session) onDeleteSession(modal.session, scope);
    closeModal();
  };

  return (
    <div className="rounded-xl border border-line bg-card p-5">
      <div className="flex items-center justify-between gap-2">
        <div className="inline-flex gap-1 rounded-pill border border-line bg-cream/60 p-1">
          {(["week", "month"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              aria-pressed={view === v}
              className={cn(
                "rounded-pill px-3 py-1 font-seeded text-xs font-semibold capitalize transition-colors",
                view === v ? "bg-ink text-cream" : "text-stone hover:text-ink"
              )}
            >
              {v}
            </button>
          ))}
        </div>
        {view === "week" ? (
          <WeekNav weekOffset={weekOffset} setWeekOffset={setWeekOffset} />
        ) : (
          <MonthNav monthOffset={monthOffset} setMonthOffset={setMonthOffset} />
        )}
      </div>

      {view === "week" ? (
        <WeekGrid
          sessions={sessions}
          sessionTypes={sessionTypes}
          weekOffset={weekOffset}
          onAdd={openAdd}
          onEdit={openEdit}
          onMove={onMoveSession}
          onResize={onResizeSession}
        />
      ) : (
        <MonthGrid
          sessions={sessions}
          sessionTypes={sessionTypes}
          tournamentEntries={tournamentEntries}
          monthOffset={monthOffset}
        />
      )}

      <p className="mt-3 text-xs text-stone">
        Your own sessions. Add or remove anything, and nothing is auto-planned.
      </p>

      <SessionFormModal
        open={!!modal}
        onClose={closeModal}
        session={modal?.session ?? null}
        defaultDay={modal?.day ?? "Mon"}
        defaultTime={modal?.time}
        types={sessionTypes}
        onSave={handleSave}
        onDelete={handleDelete}
      />
    </div>
  );
}

function WeekNav({
  weekOffset,
  setWeekOffset,
}: {
  weekOffset: number;
  setWeekOffset: (fn: (v: number) => number) => void;
}) {
  const start = new Date(`${dateForWeekday("Mon", weekOffset)}T00:00:00`);
  const end = new Date(`${dateForWeekday("Sun", weekOffset)}T00:00:00`);
  const label = `${start.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${end.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
  return (
    <div className="flex items-center gap-1.5">
      <span className="hidden text-xs text-stone-light sm:inline">{label}</span>
      <NavButton label="Previous week" onClick={() => setWeekOffset((v) => v - 1)} icon={ChevronLeft} />
      <NavButton label="Next week" onClick={() => setWeekOffset((v) => v + 1)} icon={ChevronRight} />
    </div>
  );
}

function MonthNav({
  monthOffset,
  setMonthOffset,
}: {
  monthOffset: number;
  setMonthOffset: (fn: (v: number) => number) => void;
}) {
  const today = new Date();
  const viewDate = new Date(today.getFullYear(), today.getMonth() + monthOffset, 1);
  const label = viewDate.toLocaleDateString("en-US", { month: "long" });
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs text-stone-light">{label}</span>
      <NavButton label="Previous month" onClick={() => setMonthOffset((v) => v - 1)} icon={ChevronLeft} />
      <NavButton label="Next month" onClick={() => setMonthOffset((v) => v + 1)} icon={ChevronRight} />
    </div>
  );
}

function NavButton({ label, onClick, icon: Icon }: { label: string; onClick: () => void; icon: typeof ChevronLeft }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="flex h-7 w-7 items-center justify-center rounded-lg border border-line text-stone transition-colors hover:text-ink focus:outline-none focus:ring-2 focus:ring-grass/30"
    >
      <Icon className="h-3.5 w-3.5" />
    </button>
  );
}

interface DragState {
  id: string;
  grabOffsetPx: number;
}

interface ResizeState {
  id: string;
  startY: number;
  originalDuration: number;
}

function WeekGrid({
  sessions,
  sessionTypes,
  weekOffset,
  onAdd,
  onEdit,
  onMove,
  onResize,
}: {
  sessions: TrainingPlannerSession[];
  sessionTypes: TrainingSessionType[];
  weekOffset: number;
  onAdd: (day: WeekdayShort, time?: string) => void;
  onEdit: (session: TrainingPlannerSession) => void;
  onMove: (id: string, day: WeekdayShort, startTime: string, weekOffset: number) => void;
  onResize: (id: string, duration: number) => void;
}) {
  const now = new Date();
  const todayKey = localDateKey(now);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const gridTop = GRID_START_HOUR * 60;

  const dateByDay = useMemo(() => {
    const map = new Map<WeekdayShort, string>();
    WEEK_ORDER.forEach((d) => map.set(d, dateForWeekday(d, weekOffset)));
    return map;
  }, [weekOffset]);

  // Real-date filtering (see the header comment on EventsCalendarCard) —
  // only sessions whose stored `date` falls on one of this real week's 7
  // dates show here, so a dragged-forward or repeat-generated occurrence in
  // a future week only appears when that week is actually being viewed.
  const sessionsByDay = useMemo(() => {
    const map = new Map<WeekdayShort, TrainingPlannerSession[]>();
    WEEK_ORDER.forEach((d) => map.set(d, []));
    const dateToDay = new Map<string, WeekdayShort>();
    dateByDay.forEach((date, day) => dateToDay.set(date, day));
    sessions.forEach((s) => {
      const day = dateToDay.get(s.date);
      if (day) map.get(day)?.push(s);
    });
    return map;
  }, [sessions, dateByDay]);

  const [dragging, setDragging] = useState<DragState | null>(null);
  const resizingRef = useRef<ResizeState | null>(null);
  const [resizePreview, setResizePreview] = useState<{ id: string; deltaPx: number } | null>(null);

  useEffect(() => {
    const handleMove = (e: MouseEvent) => {
      const r = resizingRef.current;
      if (!r) return;
      setResizePreview({ id: r.id, deltaPx: e.clientY - r.startY });
    };
    const handleUp = () => {
      const r = resizingRef.current;
      if (!r) return;
      setResizePreview((prev) => {
        const deltaPx = prev && prev.id === r.id ? prev.deltaPx : 0;
        onResize(r.id, resizedDuration(r.originalDuration, deltaPx));
        return null;
      });
      resizingRef.current = null;
    };
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [onResize]);

  return (
    <div className="mt-3 overflow-x-auto rounded-lg border border-line">
      <div className="grid min-w-[560px] grid-cols-[40px_repeat(7,1fr)]">
        <div />
        {WEEK_ORDER.map((day) => {
          const date = dateByDay.get(day) ?? "";
          const isToday = date === todayKey;
          return (
            <div
              key={day}
              className={cn(
                "flex flex-col items-center gap-0.5 border-l border-line px-1 py-2 text-center",
                isToday && "bg-grass-50/60"
              )}
            >
              <span className={cn("text-[10px] font-semibold uppercase tracking-wide text-stone-light", isToday && "text-grass")}>
                {day}
              </span>
              <span className={cn("font-mono text-xs text-ink", isToday && "font-semibold text-grass")}>
                {date ? new Date(`${date}T00:00:00`).getDate() : ""}
              </span>
            </div>
          );
        })}

        <div className="col-span-8 max-h-[420px] overflow-y-auto">
          <div className="grid grid-cols-[40px_repeat(7,1fr)]" style={{ height: GRID_HOURS.length * HOUR_HEIGHT }}>
            <div className="relative">
              {GRID_HOURS.map((h) => (
                <div
                  key={h}
                  className="absolute right-1 -translate-y-1/2 text-[10px] text-stone-light"
                  style={{ top: (h - GRID_START_HOUR) * HOUR_HEIGHT }}
                >
                  {h === 12 ? "12p" : h > 12 ? `${h - 12}p` : `${h}a`}
                </div>
              ))}
            </div>

            {WEEK_ORDER.map((day) => {
              const daySessions = sessionsByDay.get(day) ?? [];
              const placed = layoutOverlaps(daySessions);
              const date = dateByDay.get(day) ?? "";
              const isToday = date === todayKey;
              return (
                <div
                  key={day}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    if (!dragging) return;
                    const rect = e.currentTarget.getBoundingClientRect();
                    const offsetY = e.clientY - rect.top;
                    const startTime = startTimeFromPointer(offsetY, dragging.grabOffsetPx);
                    onMove(dragging.id, day, startTime, weekOffset);
                    setDragging(null);
                  }}
                  onClick={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const offsetY = e.clientY - rect.top;
                    onAdd(day, startTimeFromPointer(offsetY));
                  }}
                  className={cn(
                    "relative cursor-pointer border-l border-line transition-colors hover:bg-grass-50/30",
                    isToday && "bg-grass-50/20"
                  )}
                >
                  {GRID_HOURS.map((h) => (
                    <div
                      key={h}
                      className="absolute inset-x-0 border-t border-line/60"
                      style={{ top: (h - GRID_START_HOUR) * HOUR_HEIGHT }}
                    />
                  ))}
                  {isToday && nowMinutes >= gridTop && nowMinutes < GRID_END_HOUR * 60 && (
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
                    const liveDuration =
                      resizePreview?.id === session.id
                        ? resizedDuration(session.duration, resizePreview.deltaPx)
                        : session.duration;
                    const minHeight = Math.max(22, (liveDuration / 60) * HOUR_HEIGHT - 2);
                    const type = getType(sessionTypes, session.typeId);
                    return (
                      <div
                        key={session.id}
                        draggable
                        onDragStart={(e) => {
                          e.stopPropagation();
                          const rect = e.currentTarget.getBoundingClientRect();
                          setDragging({ id: session.id, grabOffsetPx: e.clientY - rect.top });
                        }}
                        onDragEnd={() => setDragging(null)}
                        onClick={(e) => {
                          e.stopPropagation();
                          onEdit(session);
                        }}
                        role="button"
                        tabIndex={0}
                        className="absolute z-[5] cursor-grab overflow-visible rounded-lg border border-line/80 bg-card px-1.5 py-1 text-left shadow-sm transition-shadow hover:z-20 hover:shadow-soft active:cursor-grabbing"
                        style={{
                          top,
                          minHeight,
                          left: `calc(${(col / totalCols) * 100}% + 2px)`,
                          width: `calc(${100 / totalCols}% - 4px)`,
                          borderLeftColor: type.color,
                          borderLeftWidth: 3,
                        }}
                      >
                        {/* No truncation: titles wrap and the block grows
                            past its time-slot height if it needs to, so a
                            long title is always fully readable. */}
                        <p className="whitespace-normal break-words text-xs font-medium leading-tight text-ink">
                          {session.title || type.label}
                        </p>
                        <p className="mt-0.5 whitespace-nowrap font-mono text-[10px] leading-tight text-stone-light">
                          {session.startTime} · {Math.round(liveDuration)}m
                        </p>
                        <div
                          onMouseDown={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            resizingRef.current = { id: session.id, startY: e.clientY, originalDuration: session.duration };
                            setResizePreview({ id: session.id, deltaPx: 0 });
                          }}
                          className="absolute inset-x-0 bottom-0 h-2 cursor-ns-resize"
                          aria-hidden
                        />
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <button
        type="button"
        onClick={() => onAdd(WEEK_ORDER[(new Date().getDay() + 6) % 7])}
        className="flex w-full items-center justify-center gap-1.5 border-t border-line py-2 text-xs font-medium text-stone transition-colors hover:text-grass"
      >
        <Plus className="h-3.5 w-3.5" />
        Add a session
      </button>
    </div>
  );
}

function MonthGrid({
  sessions,
  sessionTypes,
  tournamentEntries,
  monthOffset,
}: {
  sessions: TrainingPlannerSession[];
  sessionTypes: TrainingSessionType[];
  tournamentEntries: TournamentEntry[];
  monthOffset: number;
}) {
  const today = useMemo(() => new Date(), []);
  const viewDate = new Date(today.getFullYear(), today.getMonth() + monthOffset, 1);

  // Sessions are a recurring weekly template here (not a dated log — see
  // lib/supabase/training.ts's header comment), so, unchanged from before
  // this task, this repeats the same weekly pattern across every month
  // shown. Tournament entries ARE dated, so those still overlay on their
  // real calendar day.
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
              "flex min-h-[56px] flex-col gap-1 rounded-lg border p-1.5",
              isToday ? "border-grass" : "border-line"
            )}
          >
            <span className={cn("text-xs", isToday ? "font-semibold text-grass" : "text-stone")}>{date}</span>
            {dayTournaments.slice(0, 1).map((t) => (
              <span
                key={t.id}
                title={t.name}
                className="line-clamp-1 rounded px-1 py-0.5 text-[9px] font-semibold leading-tight text-ink"
                style={{ background: "rgb(var(--c-tennis) / 0.55)" }}
              >
                {t.name.split(" ")[0]}
              </span>
            ))}
            {daySessions.length > 0 && (
              <div className="mt-auto flex flex-wrap items-center gap-0.5">
                {daySessions.slice(0, 4).map((s) => {
                  const type = getType(sessionTypes, s.typeId);
                  return (
                    <span
                      key={s.id}
                      title={s.title || type.label}
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ background: type.color }}
                    />
                  );
                })}
                {daySessions.length > 1 && (
                  <span className="ml-0.5 font-mono text-[9px] text-stone-light">{daySessions.length}</span>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
