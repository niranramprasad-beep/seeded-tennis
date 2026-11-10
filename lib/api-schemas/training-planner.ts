import { z } from "zod";

// Shape validated by app/api/training/planner's route handler before it
// ever calls saveTrainingPlannerState (lib/db/events.ts). Matches
// TrainingPlannerState exactly — lib/hooks/use-events-calendar.ts always
// persists the FULL next state, never a per-field patch, so one schema
// for the whole state is the right shape here. Lives in its own module
// (rather than inline in route.ts) because Next.js's App Router rejects
// any export from a route.ts file that isn't an HTTP method/route config
// — this is the one place it can be exported for
// app/api/training/planner/route.test.ts to exercise directly.
const WeekdaySchema = z.enum(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);
const IntensitySchema = z.enum(["low", "moderate", "high"]);

const SessionSchema = z.object({
  id: z.string(),
  title: z.string(),
  typeId: z.string(),
  day: WeekdaySchema,
  date: z.string(),
  startTime: z.string(),
  duration: z.number(),
  intensity: IntensitySchema,
  notes: z.string(),
  goals: z.string(),
  drills: z.array(z.string()),
  completed: z.boolean(),
  seriesId: z.string().nullable().optional(),
});

const SessionTypeSchema = z.object({
  id: z.string(),
  label: z.string(),
  color: z.string(),
  bg: z.string(),
  text: z.string(),
});

const FolderSchema = z.object({
  id: z.string(),
  name: z.string(),
  goal: z.string(),
  sessionIds: z.array(z.string()),
});

const TemplateSchema = z.object({
  id: z.string(),
  name: z.string(),
  templateType: z.enum(["session", "plan"]),
  description: z.string(),
  payload: z.record(z.string(), z.unknown()),
});

const PreferencesSchema = z.object({
  fullTime: z.boolean(),
  weeklyHours: z.number(),
  primaryGoal: z.string(),
  constraints: z.string(),
});

export const TrainingPlannerBodySchema = z.object({
  sessions: z.array(SessionSchema),
  sessionTypes: z.array(SessionTypeSchema),
  plans: z.array(FolderSchema),
  activePlanId: z.string(),
  templates: z.array(TemplateSchema),
  preferences: PreferencesSchema.optional(),
});
