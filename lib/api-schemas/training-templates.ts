import { z } from "zod";

// Shape validated by app/api/training/templates' route handler before it
// ever calls saveTrainingTemplate (lib/db/events.ts). Lives in its own
// module (rather than inline in route.ts) because Next.js's App Router
// rejects any export from a route.ts file that isn't an HTTP method/route
// config — this is the one place it can be exported for
// app/api/training/templates/route.test.ts to exercise directly.
export const TrainingTemplateBodySchema = z.object({
  id: z.string().optional(),
  name: z.string(),
  templateType: z.enum(["session", "plan"]),
  description: z.string(),
  payload: z.record(z.string(), z.unknown()),
});
