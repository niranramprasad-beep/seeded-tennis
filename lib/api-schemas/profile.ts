import { z } from "zod";
import { ENROLLMENT_TERMS } from "@/lib/types";
import { SEASON_KEY_PATTERN, TOURNAMENTS_PLANNED_MAX } from "@/lib/tournaments-planned";
import { GPA_MAX, GPA_MIN, GPA_RANGE_ERROR, PROFILE_NAME_REQUIRED, hasVisibleName } from "@/lib/profile-fields";

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
  // Never blank (QA sweep H2): a blank name was saved, and the next load
  // showed the login email in its place — which then reached the coach
  // email. Trimmed here, so "  " is blank too.
  name: z.string().trim().refine(hasVisibleName, PROFILE_NAME_REQUIRED),
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
  // The season the count is for (seasonKey(), e.g. "fall-2026"); 049's
  // CHECK on profiles.tournaments_planned_season is the real rule.
  tournamentsPlannedSeason: z.string().regex(SEASON_KEY_PATTERN).nullable().optional(),
  onboarded: z.boolean(),
  homeArea: z.string().optional(),
  utrProfileLink: z.string().optional(),
  // profiles_gpa_check (014) is 0–5. Checked here so a bad value is a 400
  // with a sentence, not a 500 carrying raw Postgres text (QA sweep H3).
  gpa: z.number().min(GPA_MIN, GPA_RANGE_ERROR).max(GPA_MAX, GPA_RANGE_ERROR).nullable().optional(),
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
