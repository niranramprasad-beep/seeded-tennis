import type { WeekdayShort } from "@/lib/types";
import { localDateKey } from "@/lib/time";

// Grid math for the /events week view. Pure functions and constants only —
// no JSX, no React state.

/** Anything with a start time and a length can be laid out on the grid. */
export interface Timed {
  startTime: string;
  duration: number;
}

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

/** The week grid's hour axis: "6 am", "12 pm", "4 pm". */
export function hourLabel(h: number): string {
  const suffix = h >= 12 && h < 24 ? "pm" : "am";
  const twelve = h % 12 === 0 ? 12 : h % 12;
  return `${twelve} ${suffix}`;
}

/**
 * A stored "HH:MM" start time in the axis's style: "16:00" → "4:00 pm",
 * "09:30" → "9:30 am", "00:15" → "12:15 am". Sessions printed "16:00" next
 * to an axis reading "4 pm" (PR D, D7). Anything unparseable is returned
 * as stored rather than guessed at.
 */
export function formatClockTime(time: string): string {
  const m = /^(\d{1,2}):(\d{2})/.exec(time);
  if (!m) return time;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return time;
  const [twelve, suffix] = hourLabel(h).split(" ");
  return `${twelve}:${m[2]} ${suffix}`;
}

export function minutesToTime(minutes: number): string {
  const clamped = Math.max(0, Math.min(24 * 60 - 1, minutes));
  const h = Math.floor(clamped / 60);
  const m = Math.round((clamped % 60) / 15) * 15;
  return `${String(h).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/** Side-by-side columns for sessions whose time ranges overlap, so two
 * things booked at once don't render on top of each other. */
export function layoutOverlaps<T extends Timed>(sessions: T[]) {
  const sorted = [...sessions].sort(
    (a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime)
  );
  const columns: T[][] = [];
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

function rangesOverlap(a: Timed, b: Timed): boolean {
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

/** Sessions keyed by their real stored date ("YYYY-MM-DD"), each day sorted
 * by start time. THE one grouping both the Week and the Month view render
 * from — see lib/training/calendar-one-source.test.ts. */
export function groupByDate<T extends Timed & { date: string }>(sessions: T[]): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const s of sessions) {
    if (!s.date) continue;
    map.set(s.date, [...(map.get(s.date) ?? []), s]);
  }
  map.forEach((list) => list.sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime)));
  return map;
}

/** Which week (0 = this week, -1 = last week …) a local "YYYY-MM-DD" date
 * falls in, Monday-first — the inverse of dateForWeekday. Whole-day
 * arithmetic on local midnights, rounded, so a DST change cannot shift it. */
export function weekOffsetForDate(dateKey: string, today: Date = new Date()): number {
  const [y, m, d] = dateKey.split("-").map(Number);
  const target = new Date(y, m - 1, d);
  const mondayOf = (date: Date) =>
    new Date(date.getFullYear(), date.getMonth(), date.getDate() - ((date.getDay() + 6) % 7));
  const days = Math.round((mondayOf(target).getTime() - mondayOf(today).getTime()) / 86400000);
  return Math.round(days / 7);
}
