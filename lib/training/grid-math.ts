import type { TrainingPlannerSession } from "@/lib/supabase/training";
import type { WeekdayShort } from "@/lib/types";
import { localDateKey } from "@/lib/time";

// Extracted out of components/training/training-view.tsx so Legacy's and
// Seeded's calendar skins (components/seeded/training/*) are guaranteed
// to compute grid position/overlap identically by construction, rather than
// risking silent drift between two hand-maintained copies. Pure functions
// and constants only — no JSX, no React state.

export const WEEK_ORDER: WeekdayShort[] = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// Google Calendar-style time grid: hours run down the side, sessions are
// absolutely positioned by start time and sized by duration, instead of a
// simple stacked list of cards per day.
export const GRID_START_HOUR = 6;
export const GRID_END_HOUR = 22;
export const HOUR_HEIGHT = 64;
export const GRID_HOURS = Array.from(
  { length: GRID_END_HOUR - GRID_START_HOUR },
  (_, i) => GRID_START_HOUR + i
);

export function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

export function minutesToTime(minutes: number): string {
  const clamped = Math.max(0, Math.min(24 * 60 - 1, minutes));
  const h = Math.floor(clamped / 60);
  const m = Math.round((clamped % 60) / 15) * 15;
  return `${String(h).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/** Side-by-side columns for sessions whose time ranges overlap, so two
 * things booked at once don't render on top of each other. */
export function layoutOverlaps(sessions: TrainingPlannerSession[]) {
  const sorted = [...sessions].sort(
    (a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime)
  );
  const columns: TrainingPlannerSession[][] = [];
  return sorted
    .map((session) => {
      const start = timeToMinutes(session.startTime);
      let col = columns.findIndex(
        (c) => timeToMinutes(c[c.length - 1].startTime) + c[c.length - 1].duration <= start
      );
      if (col === -1) {
        col = columns.length;
        columns.push([]);
      }
      columns[col].push(session);
      return { session, col };
    })
    .map(({ session, col }, _i, all) => ({
      session,
      col,
      totalCols:
        Math.max(...all.filter((o) => rangesOverlap(o.session, session)).map((o) => o.col)) + 1,
    }));
}

export function rangesOverlap(a: TrainingPlannerSession, b: TrainingPlannerSession): boolean {
  const aStart = timeToMinutes(a.startTime);
  const bStart = timeToMinutes(b.startTime);
  return aStart < bStart + b.duration && bStart < aStart + a.duration;
}

export function dateForWeekday(day: WeekdayShort, weekOffset = 0): string {
  const now = new Date();
  const current = (now.getDay() + 6) % 7;
  const target = WEEK_ORDER.indexOf(day);
  const date = new Date(now);
  date.setDate(now.getDate() + (target - current) + weekOffset * 7);
  return localDateKey(date);
}
