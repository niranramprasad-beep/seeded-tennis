// Pure math for the Events calendar card's week-view drag/resize/repeat
// interactions (components/seeded/events/events-calendar-card.tsx). Kept
// separate from lib/training/grid-math.ts (which both Legacy's and Seeded's
// *week planner* skins share) because these three operations — snapping a
// drop position to a start time, deriving a resized duration from a pointer
// delta, and generating a bounded weekly series' dates — are specific to
// the Events card's own drag-to-move/resize/repeat UI, not something either
// planner skin needs. No JSX, no React state, so drag math and repeat-series
// generation can be unit-tested without mounting anything.
import { GRID_START_HOUR, HOUR_HEIGHT, minutesToTime } from "./grid-math";

/** A session series (the "repeat weekly" option) is bounded to this many
 * total occurrences — roughly a season's worth of weeks — so "repeat" can
 * never silently become unlimited/infinite recurrence. */
export const MAX_SERIES_WEEKS = 12;

/** Rounds a minute offset to the nearest 15 minutes, matching the snapping
 * lib/training/grid-math.ts's minutesToTime already applies on every other
 * planner's click-to-add — so dragging in the Events card snaps to the same
 * grid Legacy/Seeded's own week planners use. */
export function snapToQuarterHour(minutes: number): number {
  return Math.round(minutes / 15) * 15;
}

/** Converts a pointer's pixel offset from the top of the time grid into a
 * snapped "HH:MM" start time — the exact math behind dropping a session at
 * a new day/time. `grabOffsetPx` is how far below the session block's own
 * top edge the user originally grabbed it (captured on drag start), so the
 * block's top lands under the cursor instead of snapping to wherever the
 * cursor itself point is. */
export function startTimeFromPointer(pointerOffsetPx: number, grabOffsetPx = 0): string {
  const minutes = GRID_START_HOUR * 60 + ((pointerOffsetPx - grabOffsetPx) / HOUR_HEIGHT) * 60;
  return minutesToTime(minutes);
}

/** Converts a resize handle's pointer delta (in px, positive = dragging the
 * bottom edge down) into a new duration in minutes, snapped to 15 minutes
 * and never shorter than `minDuration`. */
export function resizedDuration(
  originalDuration: number,
  deltaPx: number,
  minDuration = 15
): number {
  const deltaMinutes = (deltaPx / HOUR_HEIGHT) * 60;
  return Math.max(minDuration, snapToQuarterHour(originalDuration + deltaMinutes));
}

/** Adds `days` days to an ISO "YYYY-MM-DD" date key without any timezone
 * parsing footguns (plain year/month/day arithmetic, not `Date` + UTC
 * string round-tripping — see lib/time.ts's localDateKey for the same
 * concern elsewhere). */
export function addDaysToDateKey(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const date = new Date(y, m - 1, d + days);
  const yy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

/** The real backing for the "repeat weekly" form option: given the first
 * occurrence's date and a requested total occurrence count, returns every
 * occurrence's date (first one included), one week apart. Clamped to
 * [1, MAX_SERIES_WEEKS] so a typo or a stray click can never create an
 * unbounded series — "repeat weekly" always has a real end point. */
export function generateWeeklySeriesDates(baseDateKey: string, totalOccurrences: number): string[] {
  const count = Math.max(1, Math.min(MAX_SERIES_WEEKS, Math.round(totalOccurrences)));
  return Array.from({ length: count }, (_, i) => addDaysToDateKey(baseDateKey, i * 7));
}
