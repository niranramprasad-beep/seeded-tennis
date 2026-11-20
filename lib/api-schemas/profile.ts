import { z } from "zod";
import { ENROLLMENT_TERMS } from "@/lib/types";
import { TOURNAMENTS_PLANNED_MAX } from "@/lib/tournaments-planned";

// Shape validated by app/api/profile's route handler before it ever calls
// writeCurrentPlayerProfile (lib/auth.ts) — the single highest-traffic
// write path in the app. Every settings/onboarding/profile-edit screen
// funnels through updatePlayer() (lib/context/player-context.tsx), which
// always posts the FULL merged player object here (it merges the patch
// into the current player client-side, then saves that whole object —
// never a sparse partial), so this validates the whole Player shape
// rather than a partial. Lives in its own module (rather than inline in
// route.ts) because Next.js's App Router rejects any export from a
// route.ts file that isn't an HTTP method/route config — this is the one
// place it can be exported for app/api/profile/route.test.ts to exercise
// directly.
export const PlayerBodySchema = z.object({
  name: z.string(),
  currentUTR: z.number(),
  graduationYear: z.number(),
  commitmentDate: z.string(),
  gender: z.enum(["male", "female"]),
  country: z.string(),
  role: z.enum(["player", "parent"]),
  familyCode: z.string().optional(),
  targetSchoolSlugs: z.array(z.string()),
  weaknesses: z.array(z.enum(["forehand", "backhand", "serve", "fitness", "mental"])),
  // "Tournaments planned this season" (049): a whole number 0–60 or null
  // ("Not set"). Optional: ABSENT = leave the stored value alone. The old
  // tournamentsGoal / tournamentsPlayed keys are no longer in the schema, so
  // a stale client's invented 12 is stripped here and never written.
  tournamentsPlanned: z.number().int().min(0).max(TOURNAMENTS_PLANNED_MAX).nullable().optional(),
  onboarded: z.boolean(),
  homeArea: z.string().optional(),
  utrProfileLink: z.string().optional(),
  gpa: z.number().nullable().optional(),
  deletionRequestedAt: z.string().nullable().optional(),
  // Migration 041. The CHECK constraints are the real rule; these only turn
  // a bad value into a 400 instead of a raw 23514. birthMonth is write-once
  // (the 041 trigger), so a changed value is refused by the database.
  birthMonth: z.number().int().min(1).max(12).nullable().optional(),
  enrollmentTerm: z.enum(ENROLLMENT_TERMS).nullable().optional(),
  // Accepted so the client can post its whole Player, and IGNORED:
  // email_verified_at is privileged (043) and writeCurrentPlayerProfile
  // never sends it.
  emailVerified: z.boolean().optional(),
});

export type PlayerBody = z.infer<typeof PlayerBodySchema>;

/**
 * The validated body, as writeCurrentPlayerProfile takes it. An ABSENT
 * birthMonth / enrollmentTerm / tournamentsPlanned stays undefined — "leave the stored value
 * alone" — and is never coerced to null ("clear it"): an older client that
 * never sent enrollmentTerm must not wipe the term a newer one saved.
 */
export function playerWriteFromBody(body: PlayerBody): PlayerBody {
  return { ...body };
}
