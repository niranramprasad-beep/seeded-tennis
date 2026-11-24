import { z } from "zod";

// Shape validated by app/api/matches' route handler before it ever calls
// saveMatch/deleteMatch (lib/db/events.ts) — save and delete both act on
// the caller's own `matches` rows, so one schema with a discriminated
// `kind` (same shape as app/api/outreach/route.ts) covers both. Lives in
// its own module (rather than inline in route.ts) because Next.js's App
// Router rejects any export from a route.ts file that isn't an HTTP
// method/route config — this is the one place it can be exported for
// app/api/matches/route.test.ts to exercise directly.
const PrepPlanSchema = z.object({
  warmup: z.array(z.string()),
  tactics: z.array(z.string()),
  mental: z.array(z.string()),
  matchDay: z.array(z.string()),
  generatedAt: z.string(),
});

const MatchAnalysisSchema = z.object({
  summary: z.string(),
  takeaways: z.array(z.string()),
  drills: z.array(z.string()),
  nextWeekFocus: z.string(),
  source: z.enum(["ai", "fallback"]),
});

export const MatchesBodySchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("save"),
    id: z.string().optional(),
    matchDate: z.string().min(1, "A match date is required."),
    opponent: z.string().optional(),
    // The form checks 1–16.5; the column is numeric(4,2) with a 1–16.5 CHECK.
    // A direct POST outside that range used to answer 500 "Try again".
    opponentUtr: z
      .number()
      .min(1, "Opponent UTR must be between 1.00 and 16.50.")
      .max(16.5, "Opponent UTR must be between 1.00 and 16.50.")
      .nullable()
      .optional(),
    tournamentName: z.string().optional(),
    surface: z.enum(["hard", "clay", "grass", "indoor"]),
    prepPlan: PrepPlanSchema.optional(),
    notificationRequested: z.boolean().optional(),
    result: z.enum(["win", "loss"]).nullable().optional(),
    score: z.string().optional(),
    worked: z.string().optional(),
    needsWork: z.string().optional(),
    notes: z.string().optional(),
    videoUrl: z.string().optional(),
    aiAnalysis: MatchAnalysisSchema.nullable().optional(),
  }),
  z.object({
    kind: z.literal("delete"),
    id: z.string().min(1, "A match id is required."),
  }),
]);
