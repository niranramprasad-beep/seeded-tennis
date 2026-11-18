"use client";

import { useEffect, useId, useState } from "react";
import type { TrainingSession } from "@/lib/db/training";
import { SESSION_TYPES } from "@/lib/training/session-types";
import { MAX_SERIES_WEEKS } from "@/lib/training/calendar-interactions";
import type { SessionFormValues } from "@/lib/hooks/use-events-calendar";
import { SeededButton } from "@/components/seeded/ui/button";
import { SeededDialog } from "@/components/seeded/ui/dialog";
import { localDateKey, parseLocalDate } from "@/lib/time";
import { plural } from "@/lib/utils";

const fieldClass =
  "h-11 w-full rounded-lg border border-input bg-card px-3 text-base text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";
const labelClass = "mb-1.5 block text-sm font-medium text-ink";

const DURATIONS = [15, 30, 45, 60, 75, 90, 120, 150, 180, 240];

export interface SessionFormResult extends SessionFormValues {
  repeatWeeks: number;
}

function durationLabel(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${m} min` : plural(h, "hour", "hours");
}

// The manual session form: date, start time, length, type, and an optional
// note. That is all a session is. Nothing here suggests, prefills from a
// template, or plans on the player's behalf (CLAUDE.md: manual calendar
// only). "Repeat weekly" is the player choosing to repeat their own session,
// bounded to MAX_SERIES_WEEKS.
export function SessionFormModal({
  open,
  onClose,
  session,
  defaultDate,
  defaultTime,
  onSave,
  onDelete,
}: {
  open: boolean;
  onClose: () => void;
  /** Present when editing; null when adding. */
  session: TrainingSession | null;
  /** Prefilled when opened from an empty slot. */
  defaultDate?: string;
  defaultTime?: string;
  onSave: (values: SessionFormResult) => void;
  onDelete: (scope: "one" | "series") => void;
}) {
  const isEditing = !!session;
  const ids = useId();
  const [date, setDate] = useState(localDateKey());
  const [startTime, setStartTime] = useState("16:00");
  const [duration, setDuration] = useState(60);
  const [typeId, setTypeId] = useState(SESSION_TYPES[0].id);
  const [notes, setNotes] = useState("");
  const [repeat, setRepeat] = useState(false);
  const [repeatWeeks, setRepeatWeeks] = useState(4);

  useEffect(() => {
    if (!open) return;
    setDate(session?.date ?? defaultDate ?? localDateKey());
    setStartTime(session?.startTime ?? defaultTime ?? "16:00");
    setDuration(session?.duration ?? 60);
    setTypeId(session?.typeId ?? SESSION_TYPES[0].id);
    setNotes(session?.notes ?? "");
    setRepeat(false);
    setRepeatWeeks(4);
  }, [open, session, defaultDate, defaultTime]);

  const valid = /^\d{4}-\d{2}-\d{2}$/.test(date) && /^\d{2}:\d{2}$/.test(startTime);
  const weekday = valid ? parseLocalDate(date).toLocaleDateString("en-US", { weekday: "long" }) : "";
  const durations = DURATIONS.includes(duration) ? DURATIONS : [...DURATIONS, duration].sort((a, b) => a - b);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    onSave({ date, startTime, duration, typeId, notes, repeatWeeks: repeat ? repeatWeeks : 1 });
  };

  return (
    <SeededDialog
      open={open}
      onClose={onClose}
      title={isEditing ? "Edit session" : "Add a session"}
      footer={
        <>
          {isEditing && (
            <div className="mr-auto flex flex-wrap gap-1">
              <button
                type="button"
                onClick={() => onDelete("one")}
                className="inline-flex min-h-11 items-center rounded-lg px-2 text-sm font-semibold text-error hover:bg-error-bg"
              >
                Delete
              </button>
              {session?.seriesId && (
                <button
                  type="button"
                  onClick={() => onDelete("series")}
                  className="inline-flex min-h-11 items-center rounded-lg px-2 text-sm font-semibold text-error hover:bg-error-bg"
                >
                  Delete series
                </button>
              )}
            </div>
          )}
          <SeededButton variant="secondary" type="button" onClick={onClose}>
            Cancel
          </SeededButton>
          <SeededButton type="submit" form={`${ids}-form`} disabled={!valid}>
            {isEditing ? "Save" : "Add session"}
          </SeededButton>
        </>
      }
    >
      <form id={`${ids}-form`} onSubmit={submit} className="grid gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor={`${ids}-date`} className={labelClass}>
              Date
            </label>
            <input
              id={`${ids}-date`}
              type="date"
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className={fieldClass}
            />
          </div>
          <div>
            <label htmlFor={`${ids}-time`} className={labelClass}>
              Start time
            </label>
            <input
              id={`${ids}-time`}
              type="time"
              required
              step={900}
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className={fieldClass}
            />
          </div>
          <div>
            <label htmlFor={`${ids}-duration`} className={labelClass}>
              Length
            </label>
            <select
              id={`${ids}-duration`}
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
              className={fieldClass}
            >
              {durations.map((d) => (
                <option key={d} value={d}>
                  {durationLabel(d)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor={`${ids}-type`} className={labelClass}>
              Type
            </label>
            <select id={`${ids}-type`} value={typeId} onChange={(e) => setTypeId(e.target.value)} className={fieldClass}>
              {SESSION_TYPES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label htmlFor={`${ids}-notes`} className={labelClass}>
            Note <span className="font-normal text-stone">(optional)</span>
          </label>
          <textarea
            id={`${ids}-notes`}
            value={notes}
            maxLength={1000}
            rows={3}
            onChange={(e) => setNotes(e.target.value)}
            className="min-h-[88px] w-full rounded-lg border border-input bg-card px-3 py-2.5 text-base text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          />
        </div>

        {!isEditing && (
          <div>
            <label className="flex min-h-11 items-center gap-2.5 text-sm font-medium text-ink">
              <input
                type="checkbox"
                checked={repeat}
                onChange={(e) => setRepeat(e.target.checked)}
                className="h-5 w-5 rounded border-input accent-[rgb(var(--c-primary))]"
              />
              Repeat every week
            </label>
            {repeat && (
              <div className="mt-2">
                <label htmlFor={`${ids}-weeks`} className={labelClass}>
                  For how many weeks
                </label>
                <select
                  id={`${ids}-weeks`}
                  value={repeatWeeks}
                  onChange={(e) => setRepeatWeeks(Number(e.target.value))}
                  className={fieldClass}
                >
                  {Array.from({ length: MAX_SERIES_WEEKS - 1 }, (_, i) => i + 2).map((n) => (
                    <option key={n} value={n}>
                      {plural(n, "week", "weeks")}
                    </option>
                  ))}
                </select>
                {weekday && (
                  <p className="mt-1.5 text-sm text-stone">
                    {plural(repeatWeeks, "session", "sessions")}, every {weekday}.
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {isEditing && session?.seriesId && (
          <p className="text-sm text-stone">Part of a weekly series. Saving changes only this one.</p>
        )}
      </form>
    </SeededDialog>
  );
}
