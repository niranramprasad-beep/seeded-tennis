import { z } from "zod";
import { SESSION_TYPE_IDS } from "@/lib/training/session-types";

// Shape checked by app/api/training/sessions before lib/db/training.ts
// writes anything. Per-row on purpose — see that file's header for why the
// old whole-state save was retired. Lives outside route.ts because the App
// Router rejects non-HTTP exports from a route file.

/** A real calendar date, "YYYY-MM-DD" (2026-02-30 is refused). */
export function isRealDateKey(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

/** The longest series one add can create, and the most rows one call may touch. */
export const MAX_SESSIONS_PER_WRITE = 12;

export const TrainingSessionSchema = z.object({
  id: z.string().uuid(),
  date: z.string().refine(isRealDateKey, "Pick a date."),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Pick a start time."),
  duration: z
    .number()
    .int()
    .min(15, "A session is at least 15 minutes.")
    .max(480, "A session is at most 8 hours."),
  typeId: z.enum(SESSION_TYPE_IDS),
  notes: z.string().max(1000, "Keep the note under 1,000 characters."),
  seriesId: z.string().uuid().nullable(),
});

export const TrainingSessionsBodySchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("create"),
    sessions: z.array(TrainingSessionSchema).min(1).max(MAX_SESSIONS_PER_WRITE),
  }),
  z.object({ kind: z.literal("update"), session: TrainingSessionSchema }),
  z.object({
    kind: z.literal("delete"),
    ids: z.array(z.string().uuid()).min(1).max(MAX_SESSIONS_PER_WRITE),
  }),
]);
