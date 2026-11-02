"use client";

import { motion } from "framer-motion";
import { CalendarDays, Check, Clock, GripVertical, Plus } from "lucide-react";
import type { WeekdayShort } from "@/lib/types";
import type { TrainingPlannerSession, TrainingSessionType } from "@/lib/supabase/training";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { WEEK_ORDER, dateForWeekday, getType } from "./training-helpers";

export function WeekPlanner(props: {
  sessionsByDay: Map<WeekdayShort, TrainingPlannerSession[]>;
  types: TrainingSessionType[];
  selectedDay: WeekdayShort;
  draggingId: string | null;
  onSelectDay: (day: WeekdayShort) => void;
  onAdd: (day: WeekdayShort) => void;
  onEdit: (session: TrainingPlannerSession) => void;
  onMove: (sessionId: string, day: WeekdayShort) => void;
  onDrag: (id: string | null) => void;
  onToggle: (id: string) => void;
  weekOffset: number;
}) {
  return (
    <div className="flex gap-5 overflow-x-auto pb-5">
      {WEEK_ORDER.map((day) => {
        const sessions = props.sessionsByDay.get(day) ?? [];
        const minutes = sessions.reduce((sum, s) => sum + s.duration, 0);
        const isDropTarget = Boolean(props.draggingId);
        const date = dateForWeekday(day, props.weekOffset);
        return (
          <motion.div
            key={day}
            layout
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => props.draggingId && props.onMove(props.draggingId, day)}
            className={cn(
              "min-h-[520px] w-[274px] shrink-0 rounded-[26px] border-[0.5px] border-line bg-cream/65 p-5 transition-colors 2xl:w-[300px]",
              props.selectedDay === day && "ring-2 ring-grass/20",
              isDropTarget && "hover:bg-grass-50"
            )}
          >
            <button
              onClick={() => props.onSelectDay(day)}
              className="flex w-full items-start justify-between rounded-2xl px-1 py-1 text-left focus:outline-none focus:ring-2 focus:ring-grass/30"
            >
              <span>
                <span className="block text-2xl font-medium text-ink">{day}</span>
                <span className="text-sm text-stone-light">
                  {new Date(`${date}T00:00:00`).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                  })}
                </span>
              </span>
              <span className="rounded-full bg-card px-3 py-1.5 text-xs text-stone shadow-soft">
                {Math.round(minutes / 60)}h
              </span>
            </button>
            <div className="mt-5 space-y-4">
              {sessions.map((session) => (
                <SessionCard
                  key={session.id}
                  session={session}
                  type={getType(props.types, session.typeId)}
                  onEdit={props.onEdit}
                  onDrag={props.onDrag}
                  onToggle={props.onToggle}
                />
              ))}
              {sessions.length === 0 && (
                <button
                  onClick={() => props.onAdd(day)}
                  className="flex min-h-[220px] w-full flex-col items-center justify-center rounded-[22px] border border-dashed border-line text-center text-sm text-stone-light transition-all hover:-translate-y-0.5 hover:border-grass/40 hover:bg-card hover:text-grass hover:shadow-soft focus:outline-none focus:ring-2 focus:ring-grass/30"
                >
                  <Plus className="mb-1 h-4 w-4" />
                  Add a session
                </button>
              )}
            </div>
            {sessions.length > 0 && (
              <button
                onClick={() => props.onAdd(day)}
                className="mt-5 flex w-full items-center justify-center gap-1 rounded-2xl py-3 text-sm font-medium text-stone transition-all hover:-translate-y-0.5 hover:bg-card hover:text-grass hover:shadow-soft focus:outline-none focus:ring-2 focus:ring-grass/30"
              >
                <Plus className="h-3.5 w-3.5" />
                Add
              </button>
            )}
          </motion.div>
        );
      })}
    </div>
  );
}

export function DayPlanner({
  day,
  sessions,
  types,
  onDayChange,
  onAdd,
  onEdit,
  onToggle,
}: {
  day: WeekdayShort;
  sessions: TrainingPlannerSession[];
  types: TrainingSessionType[];
  onDayChange: (day: WeekdayShort) => void;
  onAdd: (day: WeekdayShort) => void;
  onEdit: (session: TrainingPlannerSession) => void;
  onToggle: (id: string) => void;
}) {
  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-1.5">
        {WEEK_ORDER.map((d) => (
          <button
            key={d}
            onClick={() => onDayChange(d)}
            className={cn(
              "rounded-pill px-4 py-2 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-grass/30",
              day === d ? "bg-grass text-cream" : "bg-grass-50 text-stone hover:text-ink"
            )}
          >
            {d}
          </button>
        ))}
      </div>
      <Card className="p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium text-ink">{day} sessions</h2>
          <Button size="sm" onClick={() => onAdd(day)}>
            <Plus className="h-4 w-4" />
            Add session
          </Button>
        </div>
        <div className="mt-4 space-y-3">
          {sessions.map((session) => (
            <SessionCard
              key={session.id}
              session={session}
              type={getType(types, session.typeId)}
              onEdit={onEdit}
              onDrag={() => undefined}
              onToggle={onToggle}
              wide
            />
          ))}
          {sessions.length === 0 && (
            <div className="rounded-card border border-dashed border-line bg-cream/50 p-8 text-center">
              <CalendarDays className="mx-auto h-8 w-8 text-stone-light" />
              <p className="mt-3 text-sm font-medium text-ink">No sessions yet</p>
              <p className="mt-1 text-sm text-stone">
                Add a tennis block, strength session, recovery day, or anything custom.
              </p>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

export function MonthPlanner({
  sessionsByDay,
  onSelect,
}: {
  sessionsByDay: Map<WeekdayShort, TrainingPlannerSession[]>;
  onSelect: (day: WeekdayShort) => void;
}) {
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
      <h2 className="mb-3 text-lg font-medium text-ink">{monthLabel}</h2>
      <div className="grid grid-cols-7 gap-1.5">
        {WEEK_ORDER.map((d) => (
          <div key={d} className="pb-1 text-center text-[11px] font-medium uppercase tracking-wide text-stone-light">
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
                "flex aspect-square min-h-[74px] flex-col rounded-xl border-[0.5px] p-2 text-left transition-all hover:-translate-y-0.5 hover:shadow-soft focus:outline-none focus:ring-2 focus:ring-grass/30",
                isToday ? "border-grass bg-grass-50" : "border-line bg-card"
              )}
            >
              <span className={cn("text-xs", isToday ? "font-semibold text-grass" : "text-stone")}>{date}</span>
              <div className="mt-auto flex flex-wrap gap-1">
                {sessions.slice(0, 6).map((s) => (
                  <span key={s.id} className="h-1.5 w-1.5 rounded-full bg-grass" />
                ))}
              </div>
              {sessions.length > 0 && <span className="mt-1 text-[10px] text-stone-light">{sessions.length} sessions</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function SessionCard({
  session,
  type,
  onEdit,
  onDrag,
  onToggle,
  wide = false,
}: {
  session: TrainingPlannerSession;
  type: TrainingSessionType;
  onEdit: (session: TrainingPlannerSession) => void;
  onDrag: (id: string | null) => void;
  onToggle: (id: string) => void;
  wide?: boolean;
}) {
  return (
    <motion.article
      layout
      draggable
      onDragStart={() => onDrag(session.id)}
      onDragEnd={() => onDrag(null)}
      whileHover={{ y: -2 }}
      className={cn(
        "group rounded-[22px] border-[0.5px] border-line bg-card p-5 shadow-[0_8px_24px_rgba(31,31,26,0.04)] transition-shadow hover:shadow-lift",
        session.completed && "bg-grass-50/80",
        wide && "p-5"
      )}
      style={{ borderLeftColor: type.color, borderLeftWidth: 3 }}
    >
      <div className="flex items-start gap-3">
        <button
          onClick={() => onToggle(session.id)}
          className={cn(
            "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border transition-colors focus:outline-none focus:ring-2 focus:ring-grass/30",
            session.completed ? "border-grass bg-grass text-cream" : "border-line text-stone-light hover:border-grass"
          )}
          aria-label={session.completed ? "Mark session incomplete" : "Mark session complete"}
        >
          {session.completed && <Check className="h-3.5 w-3.5" />}
        </button>
        <button
          onClick={() => onEdit(session)}
          className="min-w-0 flex-1 text-left focus:outline-none focus:ring-2 focus:ring-grass/30"
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className={cn("rounded-pill px-2.5 py-1 text-[11px] font-medium", type.bg, type.text)}>
              {type.label}
            </span>
            <span className="flex items-center gap-1 text-[11px] text-stone-light">
              <Clock className="h-3 w-3" />
              {session.startTime} · {session.duration}m
            </span>
          </div>
          <h3 className={cn("mt-4 text-base font-medium leading-snug text-ink", session.completed && "line-through decoration-grass/40")}>
            {session.title}
          </h3>
          <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-stone">{session.goals || session.notes}</p>
        </button>
        <GripVertical className="mt-1 h-4 w-4 shrink-0 cursor-grab text-stone-light opacity-50 transition-opacity group-hover:opacity-100" />
      </div>
    </motion.article>
  );
}
