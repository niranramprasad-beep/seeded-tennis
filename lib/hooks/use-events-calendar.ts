"use client";

// Real CRUD for the Events calendar card's week view (components/seeded/
// events/events-calendar-card.tsx) — add/edit/delete/move/resize/repeat.
// Deliberately NOT a parallel storage path: every mutation here reads and
// writes the exact same `TrainingPlannerState` (workout_sessions +
// training_plans, via lib/supabase/training.ts's loadTrainingPlannerState/
// saveTrainingPlannerState) that /training's own TrainingView already owns,
// the same SWR cache key ["training-planner-state", storageKey] events-
// inner.tsx already fetches under. This hook just adds: optimistic local
// updates (so dragging/resizing/deleting feels instant), an Undo-offering
// toast on delete (same mechanism as lib/hooks/use-star-schools.ts's
// star-to-target undo), and the "repeat weekly" series math from
// lib/training/calendar-interactions.ts.
import { useCallback, useRef, useState } from "react";
import type { KeyedMutator } from "swr";
import type { Intensity, WeekdayShort } from "@/lib/types";
import {
  createUuid,
  saveTrainingPlannerState,
  type TrainingFolder,
  type TrainingPlannerSession,
  type TrainingPlannerState,
} from "@/lib/supabase/training";
import { dateForWeekday } from "@/lib/training/grid-math";
import { generateWeeklySeriesDates } from "@/lib/training/calendar-interactions";
import type { ToastAction, ToastVariant } from "@/components/seeded/ui/toast";

export interface SessionFormValues {
  title: string;
  typeId: string;
  day: WeekdayShort;
  startTime: string;
  duration: number;
  notes: string;
}

export interface AddSessionInput extends SessionFormValues {
  /** Which displayed week the clicked slot belongs to — same weekOffset
   * contract as lib/training/grid-math.ts's dateForWeekday. */
  weekOffset: number;
  /** 1 = a single, one-off session. >1 generates a bounded weekly series
   * (clamped by generateWeeklySeriesDates) sharing one seriesId. */
  repeatWeeks: number;
}

export interface CalendarToast {
  message: string;
  variant: ToastVariant;
  action?: ToastAction;
}

export type DeleteScope = "one" | "series";

const DEFAULT_INTENSITY: Intensity = "moderate";

/** Returns a state guaranteed to have at least one real plan and a valid
 * activePlanId — workout_sessions.training_plan_id is NOT NULL, so any
 * brand-new user whose EMPTY_PLANNER_STATE (events-inner.tsx) has zero
 * plans needs one created the first time they add a session here, the same
 * normalization TrainingInner already does for /training's own fallback. */
function withGuaranteedPlan(state: TrainingPlannerState): TrainingPlannerState {
  if (state.plans.some((p) => p.id === state.activePlanId)) return state;
  const existing = state.plans[0];
  if (existing) return { ...state, activePlanId: existing.id };
  const plan: TrainingFolder = { id: createUuid(), name: "My sessions", goal: "", sessionIds: [] };
  return { ...state, plans: [plan], activePlanId: plan.id };
}

function addSessionIdsToPlan(plans: TrainingFolder[], planId: string, sessionIds: string[]): TrainingFolder[] {
  return plans.map((p) => (p.id === planId ? { ...p, sessionIds: [...p.sessionIds, ...sessionIds] } : p));
}

export function useEventsCalendar(
  plannerState: TrainingPlannerState | null | undefined,
  mutatePlanner: KeyedMutator<TrainingPlannerState | null>
) {
  const [toast, setToast] = useState<CalendarToast | null>(null);

  // Always-fresh snapshot, readable from undo closures created on an
  // earlier render — identical reasoning to use-star-schools.ts's slugsRef.
  const stateRef = useRef(plannerState);
  stateRef.current = plannerState;

  const persist = useCallback(
    (next: TrainingPlannerState) => {
      mutatePlanner(next, { revalidate: false });
      // Best-effort background write — same "optimistic update, silent
      // revalidate-on-focus correction if it actually failed" posture as
      // events-inner.tsx's existing markEntered.
      void saveTrainingPlannerState(next).catch(() => undefined);
    },
    [mutatePlanner]
  );

  const addSession = useCallback(
    (input: AddSessionInput) => {
      const current = stateRef.current;
      if (!current) return;
      const base = withGuaranteedPlan(current);
      const baseDate = dateForWeekday(input.day, input.weekOffset);
      const occurrenceDates = generateWeeklySeriesDates(baseDate, input.repeatWeeks);
      const seriesId = occurrenceDates.length > 1 ? createUuid() : null;
      const newSessions: TrainingPlannerSession[] = occurrenceDates.map((date) => ({
        id: createUuid(),
        title: input.title.trim() || "Training session",
        typeId: input.typeId,
        day: input.day,
        date,
        startTime: input.startTime,
        duration: input.duration,
        intensity: DEFAULT_INTENSITY,
        notes: input.notes,
        goals: "",
        drills: [],
        completed: false,
        seriesId,
      }));
      const next: TrainingPlannerState = {
        ...base,
        sessions: [...base.sessions, ...newSessions],
        plans: addSessionIdsToPlan(base.plans, base.activePlanId, newSessions.map((s) => s.id)),
      };
      persist(next);
    },
    [persist]
  );

  const updateSession = useCallback(
    (id: string, input: SessionFormValues, weekOffset: number) => {
      const current = stateRef.current;
      if (!current) return;
      const date = dateForWeekday(input.day, weekOffset);
      const next: TrainingPlannerState = {
        ...current,
        sessions: current.sessions.map((s) =>
          s.id === id
            ? {
                ...s,
                title: input.title.trim() || "Training session",
                typeId: input.typeId,
                day: input.day,
                date,
                startTime: input.startTime,
                duration: input.duration,
                notes: input.notes,
              }
            : s
        ),
      };
      persist(next);
    },
    [persist]
  );

  /** Drag-to-move: updates the session's real day/date/start time. */
  const moveSession = useCallback(
    (id: string, day: WeekdayShort, startTime: string, weekOffset: number) => {
      const current = stateRef.current;
      if (!current) return;
      const date = dateForWeekday(day, weekOffset);
      const next: TrainingPlannerState = {
        ...current,
        sessions: current.sessions.map((s) => (s.id === id ? { ...s, day, date, startTime } : s)),
      };
      persist(next);
    },
    [persist]
  );

  /** Drag-the-edge-to-resize: updates the session's real duration. */
  const resizeSession = useCallback(
    (id: string, duration: number) => {
      const current = stateRef.current;
      if (!current) return;
      const next: TrainingPlannerState = {
        ...current,
        sessions: current.sessions.map((s) => (s.id === id ? { ...s, duration } : s)),
      };
      persist(next);
    },
    [persist]
  );

  const activeTokenRef = useRef(0);

  const deleteSession = useCallback(
    (session: TrainingPlannerSession, scope: DeleteScope = "one") => {
      const current = stateRef.current;
      if (!current) return;

      const removeIds = new Set(
        scope === "series" && session.seriesId
          ? current.sessions.filter((s) => s.seriesId === session.seriesId).map((s) => s.id)
          : [session.id]
      );
      const removedSessions = current.sessions.filter((s) => removeIds.has(s.id));
      if (removedSessions.length === 0) return;
      const membership = current.plans.flatMap((p) =>
        p.sessionIds.filter((sid) => removeIds.has(sid)).map((sessionId) => ({ sessionId, planId: p.id }))
      );

      const next: TrainingPlannerState = {
        ...current,
        sessions: current.sessions.filter((s) => !removeIds.has(s.id)),
        plans: current.plans.map((p) => ({ ...p, sessionIds: p.sessionIds.filter((sid) => !removeIds.has(sid)) })),
      };

      const token = ++activeTokenRef.current;
      let settled = false;
      persist(next);

      const undo = () => {
        if (settled) return;
        settled = true;
        const latest = stateRef.current;
        if (!latest) return;
        const toRestore = removedSessions.filter((s) => !latest.sessions.some((existing) => existing.id === s.id));
        const restoredPlans = latest.plans.map((p) => {
          const idsToAdd = membership
            .filter((m) => m.planId === p.id)
            .map((m) => m.sessionId)
            .filter((id) => !p.sessionIds.includes(id) && toRestore.some((s) => s.id === id));
          return idsToAdd.length ? { ...p, sessionIds: [...p.sessionIds, ...idsToAdd] } : p;
        });
        persist({ ...latest, sessions: [...latest.sessions, ...toRestore], plans: restoredPlans });
      };

      setToast({
        message:
          removedSessions.length > 1
            ? `Deleted ${removedSessions.length} sessions in this series.`
            : `Deleted "${session.title || "session"}".`,
        variant: "default",
        action: { label: "Undo", onClick: undo },
      });

      // A later delete's toast should never be silently cleared by a
      // stale timer from this one.
      return () => {
        if (activeTokenRef.current === token) settled = true;
      };
    },
    [persist]
  );

  const dismissToast = useCallback(() => setToast(null), []);

  return {
    addSession,
    updateSession,
    moveSession,
    resizeSession,
    deleteSession,
    toast,
    dismissToast,
  };
}
