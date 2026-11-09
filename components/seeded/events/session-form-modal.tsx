"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import type { WeekdayShort } from "@/lib/types";
import type { TrainingPlannerSession, TrainingSessionType } from "@/lib/supabase/training";
import { WEEK_ORDER } from "@/lib/training/grid-math";
import { MAX_SERIES_WEEKS } from "@/lib/training/calendar-interactions";
import type { SessionFormValues } from "@/lib/hooks/use-events-calendar";
import { SeededButton } from "@/components/seeded/ui/button";
import { ModalShell } from "@/components/seeded/family/budget-modals";
import { cn } from "@/lib/utils";

const fieldClass = "h-11 w-full rounded-md border border-input bg-card px-3 text-base text-ink focus:outline-none focus:ring-2 focus:ring-grass/30";
const labelClass = "mb-1.5 block text-sm font-medium text-stone";

export interface SessionFormResult extends SessionFormValues {
  repeatWeeks: number;
}

interface SessionFormModalProps {
  open: boolean;
  onClose: () => void;
  /** Present when editing an existing session; absent when adding a new one. */
  session: TrainingPlannerSession | null;
  /** Prefilled when opened by clicking an empty slot. */
  defaultDay: WeekdayShort;
  defaultTime?: string;
  types: TrainingSessionType[];
  onSave: (values: SessionFormResult) => void;
  onDelete: (scope: "one" | "series") => void;
}

// A small, real create/edit form for the Events calendar card specifically —
// deliberately NOT the full SessionDrawer inside components/training/
// training-view.tsx (goals/drills/templates/custom-type management the
// Events card's week grid has no room or need for). Same ModalShell/
// fieldClass shell components/seeded/family/budget-modals.tsx already
// established, just with this card's own fields: title, day, time,
// duration, type, notes, and — only when adding, never when editing a
// session that might already belong to a series — a bounded "repeat
// weekly" option (lib/training/calendar-interactions.ts's
// generateWeeklySeriesDates).
export function SessionFormModal({
  open,
  onClose,
  session,
  defaultDay,
  defaultTime,
  types,
  onSave,
  onDelete,
}: SessionFormModalProps) {
  const isEditing = !!session;
  const [title, setTitle] = useState("");
  const [day, setDay] = useState<WeekdayShort>(defaultDay);
  const [startTime, setStartTime] = useState(defaultTime ?? "16:00");
  const [duration, setDuration] = useState(60);
  const [typeId, setTypeId] = useState(types[0]?.id ?? "tennis");
  const [notes, setNotes] = useState("");
  const [repeat, setRepeat] = useState(false);
  const [repeatWeeks, setRepeatWeeks] = useState(6);
  const [confirmingDelete, setConfirmingDelete] = useState<"one" | "series" | null>(null);

  useEffect(() => {
    if (!open) return;
    setConfirmingDelete(null);
    if (session) {
      setTitle(session.title);
      setDay(session.day);
      setStartTime(session.startTime);
      setDuration(session.duration);
      setTypeId(session.typeId);
      setNotes(session.notes);
      setRepeat(false);
      setRepeatWeeks(6);
    } else {
      setTitle("");
      setDay(defaultDay);
      setStartTime(defaultTime ?? "16:00");
      setDuration(60);
      setTypeId(types[0]?.id ?? "tennis");
      setNotes("");
      setRepeat(false);
      setRepeatWeeks(6);
    }
  }, [open, session, defaultDay, defaultTime, types]);

  const submit = () => {
    onSave({
      title,
      typeId,
      day,
      startTime,
      duration: Math.max(15, Math.round(duration)),
      notes,
      repeatWeeks: repeat ? repeatWeeks : 1,
    });
  };

  return (
    <ModalShell open={open} onClose={onClose} titleId="session-form-title">
      <div className="flex items-start justify-between">
        <h2 id="session-form-title" className="text-lg font-semibold text-ink">
          {isEditing ? "Edit session" : "Add session"}
        </h2>
        <button onClick={onClose} aria-label="Close" className="text-stone-light hover:text-ink">
          <X className="h-5 w-5" />
        </button>
      </div>

      <label className="mt-4 block">
        <span className={labelClass}>Title</span>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Serve + return drills"
          className={fieldClass}
          autoFocus
        />
      </label>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <label className="block">
          <span className={labelClass}>Day</span>
          <select value={day} onChange={(e) => setDay(e.target.value as WeekdayShort)} className={fieldClass}>
            {WEEK_ORDER.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className={labelClass}>Type</span>
          <select value={typeId} onChange={(e) => setTypeId(e.target.value)} className={fieldClass}>
            {types.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <label className="block">
          <span className={labelClass}>Start time</span>
          <input
            type="time"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            className={fieldClass}
          />
        </label>
        <label className="block">
          <span className={labelClass}>Duration (minutes)</span>
          <input
            type="number"
            min={15}
            step={15}
            value={duration}
            onChange={(e) => setDuration(Number(e.target.value))}
            className={fieldClass}
          />
        </label>
      </div>

      <label className="mt-4 block">
        <span className={labelClass}>Notes</span>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Anything to remember for this one"
          className={cn(fieldClass, "h-auto min-h-[84px] py-2.5")}
        />
      </label>

      {!isEditing && (
        <div className="mt-4 rounded-lg border border-line bg-cream/60 p-3">
          <label className="flex items-center gap-2 text-sm font-medium text-ink">
            <input
              type="checkbox"
              checked={repeat}
              onChange={(e) => setRepeat(e.target.checked)}
              className="h-4 w-4 rounded border-input text-grass focus:ring-grass/30"
            />
            Repeat weekly
          </label>
          {repeat && (
            <label className="mt-3 block">
              <span className={labelClass}>For how many weeks (max {MAX_SERIES_WEEKS})</span>
              <input
                type="number"
                min={2}
                max={MAX_SERIES_WEEKS}
                value={repeatWeeks}
                onChange={(e) =>
                  setRepeatWeeks(Math.max(2, Math.min(MAX_SERIES_WEEKS, Number(e.target.value))))
                }
                className={fieldClass}
              />
              <span className="mt-1 block text-xs text-stone-light">
                Creates {repeatWeeks} sessions, one every week on {day}. Removable as a whole series later.
              </span>
            </label>
          )}
        </div>
      )}

      {isEditing && session?.seriesId && (
        <p className="mt-4 rounded-lg border border-line bg-cream/60 p-3 text-xs text-stone">
          Part of a weekly series. Editing only changes this one session.
        </p>
      )}

      <div className="mt-5 flex items-center justify-between gap-3">
        {isEditing ? (
          confirmingDelete ? (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-stone">
                {confirmingDelete === "series" ? "Delete the whole series?" : "Delete this session?"}
              </span>
              <button
                type="button"
                onClick={() => onDelete(confirmingDelete)}
                className="font-semibold text-error hover:underline"
              >
                Yes, delete
              </button>
              <button type="button" onClick={() => setConfirmingDelete(null)} className="text-stone hover:text-ink">
                Cancel
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <button
                type="button"
                onClick={() => setConfirmingDelete("one")}
                className="font-semibold text-error hover:underline"
              >
                Delete
              </button>
              {session?.seriesId && (
                <button
                  type="button"
                  onClick={() => setConfirmingDelete("series")}
                  className="font-semibold text-error hover:underline"
                >
                  Delete whole series
                </button>
              )}
            </div>
          )
        ) : (
          <span />
        )}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-11 items-center justify-center rounded-lg border border-input bg-card px-[18px] text-[15px] font-semibold text-ink transition-colors hover:bg-subtle-hover"
          >
            Cancel
          </button>
          <SeededButton onClick={submit} disabled={!title.trim()}>
            {isEditing ? "Save" : "Add session"}
          </SeededButton>
        </div>
      </div>
    </ModalShell>
  );
}
