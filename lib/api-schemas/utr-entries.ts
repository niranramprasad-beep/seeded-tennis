import { z } from "zod";

// Shape validated by app/api/utr-entries' route handler before it ever
// calls createUtrEntry (lib/db/plan.ts) — the actual business rule (UTR
// within range, a real date) lives there, not here; this only checks that
// the body is the right shape. Lives in its own module (rather than
// inline in route.ts) because Next.js's App Router rejects any export
// from a route.ts file that isn't an HTTP method/route config — this is
// the one place it can be exported for app/api/utr-entries/route.test.ts
// to exercise directly.
export const UtrEntryBodySchema = z.object({
  utr: z.number(),
  recordedAt: z.string().min(1, "A date is required."),
  note: z.string().optional(),
});
