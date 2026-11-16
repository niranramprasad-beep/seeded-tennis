import { z } from "zod";

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
  tournamentsPlayed: z.number(),
  tournamentsGoal: z.number(),
  onboarded: z.boolean(),
  homeArea: z.string().optional(),
  utrProfileLink: z.string().optional(),
  gpa: z.number().nullable().optional(),
  deletionRequestedAt: z.string().nullable().optional(),
});
