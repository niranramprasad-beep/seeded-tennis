"use client";

// Add / edit / move / resize / delete for the player's own training
// calendar on /events. Every write is one of lib/db/training.ts's per-row
// calls; the calendar updates at once (optimistic) and then:
//   - success: a toast says what happened ("Session added.");
//   - failure: the list is re-read from the server and an error toast says
//     the change did not save — never a silent revert, never a stuck
//     "Saving…" (both shipped in the old Training drawer).
// Delete offers Undo, which re-creates the same rows with the same ids.
import { useCallback, useRef, useState } from "react";
import type { KeyedMutator } from "swr";
import {
  createTrainingSessions,
  createUuid,
  deleteTrainingSessions,
  updateTrainingSession,
  type TrainingSession,
} from "@/lib/db/training";
import { generateWeeklySeriesDates } from "@/lib/training/calendar-interactions";
import type { ToastAction, ToastVariant } from "@/components/seeded/ui/toast";
import { plural } from "@/lib/utils";

/** What the session form edits. */
export interface SessionFormValues {
  date: string;
  startTime: string;
  duration: number;
  typeId: string;
  notes: string;
}

export interface AddSessionInput extends SessionFormValues {
  /** 1 = a one-off session. More creates a bounded weekly series. */
  repeatWeeks: number;
}

export interface CalendarToast {
  message: string;
  variant: ToastVariant;
  action?: ToastAction;
}

export type DeleteScope = "one" | "series";

export const SESSIONS_KEY = "training-sessions";

const SAVE_FAILED = "That change didn't save. Check your connection and try again.";

function byDateThenTime(a: TrainingSession, b: TrainingSession): number {
  return a.date === b.date ? a.startTime.localeCompare(b.startTime) : a.date.localeCompare(b.date);
}

export function useEventsCalendar(
  sessions: TrainingSession[] | undefined,
  mutate: KeyedMutator<TrainingSession[]>
) {
  const [toast, setToast] = useState<CalendarToast | null>(null);
  const sessionsRef = useRef(sessions ?? []);
  sessionsRef.current = sessions ?? [];

  const apply = useCallback(
    (next: TrainingSession[]) => {
      void mutate([...next].sort(byDateThenTime), { revalidate: false });
    },
    [mutate]
  );

  const fail = useCallback(
    (err: unknown) => {
      void mutate();
      setToast({ message: err instanceof Error && err.message ? err.message : SAVE_FAILED, variant: "error" });
    },
    [mutate]
  );

  const addSession = useCallback(
    async (input: AddSessionInput) => {
      const dates = generateWeeklySeriesDates(input.date, input.repeatWeeks);
      const seriesId = dates.length > 1 ? createUuid() : null;
      const created: TrainingSession[] = dates.map((date) => ({
        id: createUuid(),
        date,
        startTime: input.startTime,
        duration: input.duration,
        typeId: input.typeId,
        notes: input.notes.trim(),
        seriesId,
      }));
      apply([...sessionsRef.current, ...created]);
      try {
        await createTrainingSessions(created);
        setToast({
          message: created.length > 1 ? `${plural(created.length, "session", "sessions")} added.` : "Session added.",
          variant: "success",
        });
      } catch (err) {
        fail(err);
      }
    },
    [apply, fail]
  );

  const replace = useCallback(
    async (id: string, patch: Partial<TrainingSession>, successMessage?: string) => {
      const current = sessionsRef.current.find((s) => s.id === id);
      if (!current) return;
      const updated = { ...current, ...patch };
      apply(sessionsRef.current.map((s) => (s.id === id ? updated : s)));
      try {
        await updateTrainingSession(updated);
        if (successMessage) setToast({ message: successMessage, variant: "success" });
      } catch (err) {
        fail(err);
      }
    },
    [apply, fail]
  );

  const updateSession = useCallback(
    (id: string, values: SessionFormValues) =>
      replace(id, { ...values, notes: values.notes.trim() }, "Session saved."),
    [replace]
  );

  /** Drag-to-move: a new date and start time. */
  const moveSession = useCallback(
    (id: string, date: string, startTime: string) => replace(id, { date, startTime }),
    [replace]
  );

  /** Drag-the-edge-to-resize: a new length. */
  const resizeSession = useCallback((id: string, duration: number) => replace(id, { duration }), [replace]);

  const deleteSession = useCallback(
    async (session: TrainingSession, scope: DeleteScope = "one") => {
      const removed =
        scope === "series" && session.seriesId
          ? sessionsRef.current.filter((s) => s.seriesId === session.seriesId)
          : sessionsRef.current.filter((s) => s.id === session.id);
      if (removed.length === 0) return;
      const removedIds = new Set(removed.map((s) => s.id));
      apply(sessionsRef.current.filter((s) => !removedIds.has(s.id)));
      try {
        await deleteTrainingSessions([...removedIds]);
      } catch (err) {
        fail(err);
        return;
      }

      let undone = false;
      const undo = async () => {
        if (undone) return;
        undone = true;
        const toRestore = removed.filter((s) => !sessionsRef.current.some((x) => x.id === s.id));
        if (toRestore.length === 0) return;
        apply([...sessionsRef.current, ...toRestore]);
        try {
          await createTrainingSessions(toRestore);
          setToast({ message: "Restored.", variant: "success" });
        } catch (err) {
          fail(err);
        }
      };

      setToast({
        message: removed.length > 1 ? `Deleted ${plural(removed.length, "session", "sessions")}.` : "Session deleted.",
        variant: "default",
        action: { label: "Undo", onClick: () => void undo() },
      });
    },
    [apply, fail]
  );

  const dismissToast = useCallback(() => setToast(null), []);

  return { addSession, updateSession, moveSession, resizeSession, deleteSession, toast, dismissToast };
}
