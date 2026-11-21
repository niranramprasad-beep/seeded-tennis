"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Trophy } from "lucide-react";
import type { TrainingSession } from "@/lib/db/training";
import type { TournamentEntry } from "@/lib/db/events";
import { tournamentStatusLabel } from "@/lib/tournament-status";
import { sessionType } from "@/lib/training/session-types";
import {
  WEEK_ORDER,
  GRID_START_HOUR,
  GRID_END_HOUR,
  HOUR_HEIGHT,
  GRID_HOURS,
  timeToMinutes,
  layoutOverlaps,
  dateForWeekday,
  groupByDate,
  weekOffsetForDate,
  formatClockTime,
  hourLabel,
} from "@/lib/training/grid-math";
import { startTimeFromPointer, resizedDuration } from "@/lib/training/calendar-interactions";
import { localDateKey, parseLocalDate } from "@/lib/time";
import { cn, plural } from "@/lib/utils";

type CalendarView = "week" | "month";

export interface EventsCalendarCardProps {
  /** undefined while loading — the card shows its final shape as a skeleton. */
  sessions: TrainingSession[] | undefined;
  tournamentEntries: TournamentEntry[];
  onAdd: (date: string, time?: string) => void;
  onEdit: (session: TrainingSession) => void;
  /** A saved tournament on the calendar was clicked — opens its edit dialog. */
  onOpenTournament: (entry: TournamentEntry) => void;
  onMove: (id: string, date: string, startTime: string) => void;
  onResize: (id: string, duration: number) => void;
}

// Saved tournaments show in every view as ALL-DAY items (a tournament has a
// date, never a start time): a row above the week grid, the top of each day
// in the phone list, and the day cell in Month.
//
// ONE source of sessions for both views: `groupByDate(sessions)`, keyed by
// each session's real stored date. The live bug this replaces: Week filtered
// by real date (and showed 0) while Month grouped by WEEKDAY, so every old
// generated row appeared on every matching weekday of every month — dots on
// every day. lib/training/calendar-one-source.test.ts fails the build if a
// view groups by weekday again.
export function EventsCalendarCard({
  sessions,
  tournamentEntries,
  onAdd,
  onEdit,
  onOpenTournament,
  onMove,
  onResize,
}: EventsCalendarCardProps) {
  const [view, setView] = useState<CalendarView>("week");
  const [weekOffset, setWeekOffset] = useState(0);
  const [monthOffset, setMonthOffset] = useState(0);
  const byDate = useMemo(() => groupByDate(sessions ?? []), [sessions]);
  const tournamentsByDate = useMemo(() => groupTournamentsByDate(tournamentEntries), [tournamentEntries]);

  const openWeekOf = (dateKey: string) => {
    setWeekOffset(weekOffsetForDate(dateKey));
    setView("week");
  };

  return (
    <section aria-labelledby="calendar-heading" className="rounded-xl border border-line bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h2 id="calendar-heading" className="text-lg font-semibold text-ink">
            Schedule
          </h2>
          <div className="inline-flex rounded-lg border border-line p-0.5" role="group" aria-label="Calendar view">
            {(["week", "month"] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                aria-pressed={view === v}
                className={cn(
                  "min-h-11 rounded-md px-3 text-sm font-semibold capitalize transition-colors sm:min-h-9",
                  view === v ? "bg-grass-50 text-grass" : "text-stone hover:text-ink"
                )}
              >
                {v}
              </button>
            ))}
          </div>
        </div>
        {view === "week" ? (
          <PeriodNav
            key={view}
            label={weekLabel(weekOffset)}
            prevLabel="Previous week"
            nextLabel="Next week"
            onPrev={() => setWeekOffset((v) => v - 1)}
            onNext={() => setWeekOffset((v) => v + 1)}
            onToday={weekOffset !== 0 ? () => setWeekOffset(0) : undefined}
          />
        ) : (
          <PeriodNav
            key={view}
            label={monthLabel(monthOffset)}
            prevLabel="Previous month"
            nextLabel="Next month"
            onPrev={() => setMonthOffset((v) => v - 1)}
            onNext={() => setMonthOffset((v) => v + 1)}
            onToday={monthOffset !== 0 ? () => setMonthOffset(0) : undefined}
          />
        )}
      </div>

      {sessions === undefined ? (
        <CalendarSkeleton />
      ) : view === "week" ? (
        <>
          <WeekAgenda
            byDate={byDate}
            tournamentsByDate={tournamentsByDate}
            weekOffset={weekOffset}
            onAdd={onAdd}
            onEdit={onEdit}
            onOpenTournament={onOpenTournament}
          />
          <WeekGrid
            byDate={byDate}
            tournamentsByDate={tournamentsByDate}
            weekOffset={weekOffset}
            onAdd={onAdd}
            onEdit={onEdit}
            onOpenTournament={onOpenTournament}
            onMove={onMove}
            onResize={onResize}
          />
        </>
      ) : (
        <MonthGrid byDate={byDate} tournamentsByDate={tournamentsByDate} monthOffset={monthOffset} onPickDay={openWeekOf} />
      )}

      <p className="mt-3 text-[15px] text-stone">Only the sessions and tournaments you add. Nothing is planned for you.</p>
    </section>
  );
}

function weekLabel(weekOffset: number): string {
  const fmt = (d: string) => parseLocalDate(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `${fmt(dateForWeekday("Mon", weekOffset))} – ${fmt(dateForWeekday("Sun", weekOffset))}`;
}

function monthLabel(monthOffset: number): string {
  const today = new Date();
  return new Date(today.getFullYear(), today.getMonth() + monthOffset, 1).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}

function PeriodNav({
  label,
  prevLabel,
  nextLabel,
  onPrev,
  onNext,
  onToday,
}: {
  label: string;
  prevLabel: string;
  nextLabel: string;
  onPrev: () => void;
  onNext: () => void;
  onToday?: () => void;
}) {
  const btn =
    "flex h-11 w-11 items-center justify-center rounded-lg border border-line text-stone transition-colors hover:text-ink sm:h-9 sm:w-9";
  return (
    <div className="flex items-center gap-1.5">
      {onToday && (
        <button type="button" onClick={onToday} className="min-h-11 rounded-lg px-2 text-sm font-semibold text-grass sm:min-h-9">
          Today
        </button>
      )}
      <span className="min-w-[7.5rem] text-center text-sm text-stone" aria-live="polite">
        {label}
      </span>
      <button type="button" onClick={onPrev} aria-label={prevLabel} className={btn}>
        <ChevronLeft className="h-4 w-4" aria-hidden />
      </button>
      <button type="button" onClick={onNext} aria-label={nextLabel} className={btn}>
        <ChevronRight className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}

function CalendarSkeleton() {
  return (
    <div className="mt-4" aria-hidden>
      <div className="grid gap-2 sm:hidden">
        {WEEK_ORDER.map((d) => (
          <div key={d} className="h-14 animate-pulse rounded-lg bg-line/50 motion-reduce:animate-none" />
        ))}
      </div>
      <div className="hidden h-[560px] animate-pulse rounded-lg bg-line/50 motion-reduce:animate-none sm:block" />
    </div>
  );
}

function timeRange(s: TrainingSession): string {
  return `${formatClockTime(s.startTime)} · ${s.duration} min`;
}

/** Tournaments by their local event date (a date-only value: the key is
 *  the stored YYYY-MM-DD, never a Date round-trip). */
function groupTournamentsByDate(entries: TournamentEntry[]): Map<string, TournamentEntry[]> {
  const map = new Map<string, TournamentEntry[]>();
  for (const t of entries) {
    const key = t.eventDate.slice(0, 10);
    map.set(key, [...(map.get(key) ?? []), t]);
  }
  return map;
}

function tournamentAriaLabel(t: TournamentEntry): string {
  return `${t.name}, tournament, all day, ${tournamentStatusLabel(t.status)}. Edit.`;
}

/** An all-day tournament item, the same in the phone list and the week grid. */
function TournamentItem({
  entry,
  onOpen,
  compact = false,
}: {
  entry: TournamentEntry;
  onOpen: (entry: TournamentEntry) => void;
  compact?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onOpen(entry);
      }}
      aria-label={tournamentAriaLabel(entry)}
      className={cn(
        "flex w-full items-center gap-1.5 rounded-md border border-grass-100 bg-grass-50 text-left text-grass hover:bg-grass-100",
        compact ? "min-h-7 px-1.5 py-0.5" : "min-h-11 px-2 py-1"
      )}
    >
      <Trophy className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span className="min-w-0">
        <span className={cn("block truncate font-semibold", compact ? "text-[11px] leading-tight" : "text-sm")}>{entry.name}</span>
        {!compact && (
          <span className="block text-xs text-stone">All day · {tournamentStatusLabel(entry.status)}</span>
        )}
      </span>
    </button>
  );
}

/** Phones: a day-by-day list. Seven time columns do not fit in 320px, and a
 * sideways-scrolling grid hid Fri–Sun (the reported bug). */
function WeekAgenda({
  byDate,
  tournamentsByDate,
  weekOffset,
  onAdd,
  onEdit,
  onOpenTournament,
}: {
  byDate: Map<string, TrainingSession[]>;
  tournamentsByDate: Map<string, TournamentEntry[]>;
  weekOffset: number;
  onAdd: (date: string) => void;
  onEdit: (session: TrainingSession) => void;
  onOpenTournament: (entry: TournamentEntry) => void;
}) {
  const todayKey = localDateKey();
  return (
    <ol className="mt-4 divide-y divide-line rounded-lg border border-line sm:hidden">
      {WEEK_ORDER.map((day) => {
        const date = dateForWeekday(day, weekOffset);
        const list = byDate.get(date) ?? [];
        const events = tournamentsByDate.get(date) ?? [];
        const isToday = date === todayKey;
        return (
          <li key={day} className="flex gap-3 px-3 py-2">
            <div className="w-12 shrink-0 pt-2.5">
              <span className={cn("block text-xs font-semibold uppercase text-stone", isToday && "text-grass")}>{day}</span>
              <span className={cn("block font-mono text-sm text-ink", isToday && "font-semibold text-grass")}>
                {parseLocalDate(date).getDate()}
              </span>
            </div>
            <div className="min-w-0 flex-1">
              {events.length > 0 && (
                <div className="flex flex-col gap-1 pt-1">
                  {events.map((t) => (
                    <TournamentItem key={t.id} entry={t} onOpen={onOpenTournament} />
                  ))}
                </div>
              )}
              {list.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => onEdit(s)}
                  className="flex min-h-11 w-full items-center gap-2.5 rounded-lg px-1 text-left hover:bg-subtle-hover"
                >
                  <span className="h-8 w-[3px] shrink-0 rounded-full" style={{ background: sessionType(s.typeId).color }} aria-hidden />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-ink">{sessionType(s.typeId).label}</span>
                    <span className="block font-mono text-xs text-stone">{timeRange(s)}</span>
                  </span>
                </button>
              ))}
              <button
                type="button"
                onClick={() => onAdd(date)}
                className="flex min-h-11 items-center px-1 text-sm text-stone hover:text-grass"
                aria-label={`Add a session on ${parseLocalDate(date).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}`}
              >
                {list.length || events.length ? "+ Add" : "Nothing yet · + Add"}
              </button>
            </div>
          </li>
        );
      })}
    </ol>
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

/** Tablet and up: the full-width time grid (drag to move, drag the bottom
 * edge to resize, click an empty slot to add). */
function WeekGrid({
  byDate,
  tournamentsByDate,
  weekOffset,
  onAdd,
  onEdit,
  onOpenTournament,
  onMove,
  onResize,
}: {
  byDate: Map<string, TrainingSession[]>;
  tournamentsByDate: Map<string, TournamentEntry[]>;
  weekOffset: number;
  onAdd: (date: string, time?: string) => void;
  onEdit: (session: TrainingSession) => void;
  onOpenTournament: (entry: TournamentEntry) => void;
  onMove: (id: string, date: string, startTime: string) => void;
  onResize: (id: string, duration: number) => void;
}) {
  const now = new Date();
  const todayKey = localDateKey(now);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const gridTop = GRID_START_HOUR * 60;
  const dates = WEEK_ORDER.map((d) => dateForWeekday(d, weekOffset));

  const [dragging, setDragging] = useState<DragState | null>(null);
  const resizingRef = useRef<ResizeState | null>(null);
  const [resizePreview, setResizePreview] = useState<{ id: string; deltaPx: number } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Open on the afternoon, where most sessions are, not on 6 am.
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = (14 - GRID_START_HOUR) * HOUR_HEIGHT - 16;
  }, []);

  useEffect(() => {
    const handleMove = (e: MouseEvent) => {
      const r = resizingRef.current;
      if (r) setResizePreview({ id: r.id, deltaPx: e.clientY - r.startY });
    };
    const handleUp = () => {
      const r = resizingRef.current;
      if (!r) return;
      setResizePreview((prev) => {
        const deltaPx = prev && prev.id === r.id ? prev.deltaPx : 0;
        const next = resizedDuration(r.originalDuration, deltaPx);
        if (next !== r.originalDuration) onResize(r.id, next);
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

  const cols = "grid-cols-[52px_repeat(7,minmax(0,1fr))]";

  return (
    <div className="mt-4 hidden overflow-hidden rounded-lg border border-line sm:block">
      <div className={cn("grid border-b border-line", cols)}>
        <div />
        {dates.map((date, i) => {
          const isToday = date === todayKey;
          return (
            <div key={date} className={cn("flex flex-col items-center border-l border-line py-2", isToday && "bg-grass-50")}>
              <span className={cn("text-xs font-semibold uppercase text-stone", isToday && "text-grass")}>{WEEK_ORDER[i]}</span>
              <span className={cn("font-mono text-sm text-ink", isToday && "font-semibold text-grass")}>
                {parseLocalDate(date).getDate()}
              </span>
            </div>
          );
        })}
      </div>

      {/* All-day row: saved tournaments, outside the scrolling time grid so
          they are visible whatever hour the grid is scrolled to. Only drawn
          when the week has one. */}
      {dates.some((d) => (tournamentsByDate.get(d) ?? []).length > 0) && (
        <div className={cn("grid border-b border-line", cols)}>
          <div className="flex items-start justify-end pr-2 pt-1.5 text-xs text-stone">All day</div>
          {dates.map((date) => (
            <div key={date} className="flex min-w-0 flex-col gap-1 border-l border-line p-1">
              {(tournamentsByDate.get(date) ?? []).map((t) => (
                <TournamentItem key={t.id} entry={t} onOpen={onOpenTournament} compact />
              ))}
            </div>
          ))}
        </div>
      )}

      {/* A scroll container must be reachable by keyboard (axe
          scrollable-region-focusable): tabIndex + a name. */}
      <div ref={scrollRef} className="max-h-[560px] overflow-y-auto" tabIndex={0} role="region" aria-label="Week schedule, scrollable">
        <div className={cn("grid", cols)} style={{ height: GRID_HOURS.length * HOUR_HEIGHT }}>
          <div className="relative">
            {GRID_HOURS.map((h) => (
              <div
                key={h}
                className={cn(
                  "absolute right-2 whitespace-nowrap text-xs text-stone",
                  // The first label sits below the top edge instead of
                  // straddling it — "6a" was cut in half by the scroller.
                  h === GRID_START_HOUR ? "translate-y-0.5" : "-translate-y-1/2"
                )}
                style={{ top: (h - GRID_START_HOUR) * HOUR_HEIGHT }}
              >
                {hourLabel(h)}
              </div>
            ))}
          </div>

          {dates.map((date) => {
            const placed = layoutOverlaps(byDate.get(date) ?? []);
            const isToday = date === todayKey;
            return (
              <div
                key={date}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  if (!dragging) return;
                  const rect = e.currentTarget.getBoundingClientRect();
                  onMove(dragging.id, date, startTimeFromPointer(e.clientY - rect.top, dragging.grabOffsetPx));
                  setDragging(null);
                }}
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  onAdd(date, startTimeFromPointer(e.clientY - rect.top));
                }}
                className={cn("relative cursor-pointer border-l border-line hover:bg-subtle-hover", isToday && "bg-grass-50/40")}
              >
                {GRID_HOURS.map((h) => (
                  <div key={h} className="absolute inset-x-0 border-t border-line/60" style={{ top: (h - GRID_START_HOUR) * HOUR_HEIGHT }} />
                ))}
                {isToday && nowMinutes >= gridTop && nowMinutes < GRID_END_HOUR * 60 && (
                  <div className="absolute inset-x-0 z-10 h-px bg-error" style={{ top: ((nowMinutes - gridTop) / 60) * HOUR_HEIGHT }} aria-hidden />
                )}
                {placed.map(({ session, col, totalCols }) => {
                  const start = timeToMinutes(session.startTime);
                  const liveDuration =
                    resizePreview?.id === session.id ? resizedDuration(session.duration, resizePreview.deltaPx) : session.duration;
                  const type = sessionType(session.typeId);
                  return (
                    <div
                      key={session.id}
                      draggable
                      onDragStart={(e) => {
                        e.stopPropagation();
                        setDragging({ id: session.id, grabOffsetPx: e.clientY - e.currentTarget.getBoundingClientRect().top });
                      }}
                      onDragEnd={() => setDragging(null)}
                      onClick={(e) => {
                        e.stopPropagation();
                        onEdit(session);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onEdit(session);
                        }
                      }}
                      role="button"
                      tabIndex={0}
                      aria-label={`${type.label}, ${formatClockTime(session.startTime)}, ${session.duration} minutes. Edit.`}
                      className="absolute z-[5] cursor-grab overflow-hidden rounded-md border border-line bg-card px-1.5 py-1 text-left shadow-sm hover:z-20 active:cursor-grabbing"
                      style={{
                        top: ((start - gridTop) / 60) * HOUR_HEIGHT + 1,
                        height: Math.max(24, (liveDuration / 60) * HOUR_HEIGHT - 2),
                        left: `calc(${(col / totalCols) * 100}% + 2px)`,
                        width: `calc(${100 / totalCols}% - 4px)`,
                        borderLeftColor: type.color,
                        borderLeftWidth: 3,
                      }}
                    >
                      <p className="truncate text-xs font-semibold leading-tight text-ink">{type.label}</p>
                      <p className="truncate font-mono text-[11px] leading-tight text-stone">
                        {formatClockTime(session.startTime)} · {Math.round(liveDuration)}m
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
  );
}

function MonthGrid({
  byDate,
  tournamentsByDate,
  monthOffset,
  onPickDay,
}: {
  byDate: Map<string, TrainingSession[]>;
  tournamentsByDate: Map<string, TournamentEntry[]>;
  monthOffset: number;
  onPickDay: (dateKey: string) => void;
}) {
  const today = new Date();
  const todayKey = localDateKey(today);
  const viewDate = new Date(today.getFullYear(), today.getMonth() + monthOffset, 1);

  const daysInMonth = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 0).getDate();
  const firstWeekday = (viewDate.getDay() + 6) % 7;
  const cells: (number | null)[] = [
    ...Array(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  return (
    <div className="mt-4 grid grid-cols-7 gap-1">
      {WEEK_ORDER.map((d) => (
        <div key={d} className="pb-1 text-center text-xs font-semibold uppercase text-stone">
          {d.slice(0, 2)}
        </div>
      ))}
      {cells.map((day, index) => {
        if (!day) return <div key={`blank-${index}`} />;
        const key = localDateKey(new Date(viewDate.getFullYear(), viewDate.getMonth(), day));
        const list = byDate.get(key) ?? [];
        const events = tournamentsByDate.get(key) ?? [];
        const isToday = key === todayKey;
        const label = [
          parseLocalDate(key).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }),
          list.length ? plural(list.length, "session", "sessions") : "no sessions",
          ...events.map((t) => `${t.name} (tournament, all day)`),
        ].join(", ");
        return (
          <button
            key={key}
            type="button"
            onClick={() => onPickDay(key)}
            aria-label={`${label}. Open this week.`}
            className={cn(
              "flex min-h-[52px] flex-col items-start gap-1 rounded-md border p-1 text-left transition-colors hover:bg-subtle-hover sm:min-h-[64px] sm:p-1.5",
              isToday ? "border-grass" : "border-line"
            )}
          >
            <span className={cn("text-xs", isToday ? "font-semibold text-grass" : "text-stone")}>{day}</span>
            {/* All-day tournaments: up to two names, then "+N". */}
            {events.slice(0, 2).map((t) => (
              <span
                key={t.id}
                className="hidden w-full truncate rounded bg-grass-50 px-1 text-[11px] font-semibold text-grass sm:block"
              >
                {t.name}
              </span>
            ))}
            {events.length > 2 && (
              <span className="hidden font-mono text-[10px] text-grass sm:block">+{events.length - 2}</span>
            )}
            {events.length > 0 && <span className="h-1.5 w-3 rounded-full bg-grass sm:hidden" aria-hidden />}
            {list.length > 0 && (
              <span className="mt-auto flex flex-wrap items-center gap-0.5" aria-hidden>
                {list.slice(0, 3).map((s) => (
                  <span key={s.id} className="h-1.5 w-1.5 rounded-full" style={{ background: sessionType(s.typeId).color }} />
                ))}
                {list.length > 3 && <span className="font-mono text-[10px] text-stone">+{list.length - 3}</span>}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
