import type { Intensity, WeekdayShort } from "@/lib/types";
import { getAuthedUser, getSupabase } from "./client";

export interface TrainingSessionType {
  id: string;
  label: string;
  color: string;
  bg: string;
  text: string;
}

export interface TrainingPlannerSession {
  id: string;
  title: string;
  typeId: string;
  day: WeekdayShort;
  date: string;
  startTime: string;
  duration: number;
  intensity: Intensity;
  notes: string;
  goals: string;
  drills: string[];
  completed: boolean;
}

export interface TrainingFolder {
  id: string;
  name: string;
  goal: string;
  sessionIds: string[];
}

export interface TrainingPreferences {
  fullTime: boolean;
  weeklyHours: number;
  primaryGoal: string;
  constraints: string;
}

export interface SavedTrainingTemplate {
  id: string;
  name: string;
  templateType: "session" | "plan";
  description: string;
  payload: Record<string, unknown>;
}

export interface TrainingPlannerState {
  sessions: TrainingPlannerSession[];
  sessionTypes: TrainingSessionType[];
  plans: TrainingFolder[];
  activePlanId: string;
  templates: SavedTrainingTemplate[];
  preferences?: TrainingPreferences;
}

async function getUserId(): Promise<string | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  const { data } = await getAuthedUser(supabase);
  return data.user?.id ?? null;
}

// Plain read across 4 tables that are all "auth.uid() = user_id" RLS, no
// family/role sharing — identical to what these queries want, so there's
// nothing gained by resolving the user id first and filtering by it
// ourselves; RLS already does it, and skipping straight to the queries
// saves a whole network round-trip. (workout_sessions/training_plans don't
// get date-range-limited here: this planner is a recurring weekly
// template, not a dated log — a user's current sessions stay bounded to
// roughly "however many are in their active plan(s)," not an ever-growing
// history, so there's no "visible range" to narrow to the way there is for
// matches/check-ins.)
export async function loadTrainingPlannerState(
  fallback: TrainingPlannerState,
  signal?: AbortSignal
): Promise<TrainingPlannerState | null> {
  const supabase = getSupabase();
  if (!supabase) return null;

  const withSignal = <T>(q: T): T =>
    signal ? ((q as any).abortSignal(signal) as T) : q;

  const [{ data: plans, error: plansError }, { data: sessions, error: sessionsError }, { data: settings }, { data: templates }] =
    await Promise.all([
      withSignal(supabase.from("training_plans").select("*").order("created_at", { ascending: true })),
      withSignal(supabase.from("workout_sessions").select("*").order("order_index", { ascending: true })),
      withSignal(supabase.from("user_settings").select("*").maybeSingle()),
      withSignal(supabase.from("saved_templates").select("*").order("created_at", { ascending: false })),
    ]);

  if (plansError || sessionsError) {
    throw new Error(plansError?.message ?? sessionsError?.message ?? "Could not load training data.");
  }

  if (!plans || plans.length === 0) {
    return fallback;
  }

  const mappedSessions: TrainingPlannerSession[] = (sessions ?? []).map((row: any) => ({
    id: row.id,
    title: row.title,
    typeId: row.session_type,
    day: row.weekday,
    date: row.scheduled_date,
    startTime: String(row.start_time ?? "16:00").slice(0, 5),
    duration: row.duration_minutes,
    intensity: row.intensity,
    notes: row.notes ?? "",
    goals: row.goals ?? "",
    drills: row.metadata?.drills ?? [],
    completed: row.completed,
  }));

  const mappedPlans: TrainingFolder[] = (plans ?? []).map((plan: any) => ({
    id: plan.id,
    name: plan.name,
    goal: plan.goal ?? "",
    sessionIds: mappedSessions
      .filter((session) =>
        (sessions ?? []).some(
          (row: any) => row.id === session.id && row.training_plan_id === plan.id
        )
      )
      .map((session) => session.id),
  }));

  const mappedTemplates: SavedTrainingTemplate[] = (templates ?? []).map((t: any) => ({
    id: t.id,
    name: t.name,
    templateType: t.template_type,
    description: t.description ?? "",
    payload: t.payload ?? {},
  }));

  const sessionTypes =
    (settings?.notification_preferences?.session_types as TrainingSessionType[] | undefined) ??
    fallback.sessionTypes;
  const preferences =
    (settings?.notification_preferences?.training_preferences as TrainingPreferences | undefined) ??
    fallback.preferences;

  return {
    sessions: mappedSessions,
    sessionTypes,
    plans: mappedPlans,
    activePlanId:
      (plans ?? []).find((plan: any) => plan.active)?.id ?? mappedPlans[0]?.id ?? fallback.activePlanId,
    templates: mappedTemplates,
    preferences,
  };
}

export async function saveTrainingPlannerState(
  state: TrainingPlannerState
): Promise<void> {
  const supabase = getSupabase();
  const userId = await getUserId();
  if (!supabase || !userId) return;

  const planRows = state.plans.map((plan) => ({
    id: plan.id,
    user_id: userId,
    name: plan.name,
    goal: plan.goal,
    active: plan.id === state.activePlanId,
    source: "custom",
  }));

  if (planRows.length) {
    const { error } = await supabase.from("training_plans").upsert(planRows);
    if (error) throw new Error(error.message);
  }

  const planBySession = new Map<string, string>();
  state.plans.forEach((plan) =>
    plan.sessionIds.forEach((sessionId) => planBySession.set(sessionId, plan.id))
  );

  const sessionRows = state.sessions
    .filter((session) => planBySession.has(session.id))
    .map((session, index) => ({
      id: session.id,
      user_id: userId,
      training_plan_id: planBySession.get(session.id),
      title: session.title,
      session_type: session.typeId,
      scheduled_date: session.date,
      weekday: session.day,
      start_time: session.startTime,
      duration_minutes: session.duration,
      intensity: session.intensity,
      notes: session.notes,
      goals: session.goals,
      completed: session.completed,
      order_index: index,
      metadata: { drills: session.drills },
    }));

  if (sessionRows.length) {
    const { error } = await supabase.from("workout_sessions").upsert(sessionRows);
    if (error) throw new Error(error.message);
  }

  const sessionIds = state.sessions.map((session) => session.id);
  const planIds = state.plans.map((plan) => plan.id);

  let sessionDelete = supabase.from("workout_sessions").delete().eq("user_id", userId);
  if (sessionIds.length) {
    sessionDelete = sessionDelete.not("id", "in", `(${sessionIds.join(",")})`);
  }
  await sessionDelete;

  let planDelete = supabase.from("training_plans").delete().eq("user_id", userId);
  if (planIds.length) {
    planDelete = planDelete.not("id", "in", `(${planIds.join(",")})`);
  }
  await planDelete;

  // Read-then-merge: notification_preferences is a shared JSONB bag (also
  // used by lib/supabase/design-preference.ts for the design/seededMode
  // choice) — a blind overwrite here would silently wipe whatever else is
  // sitting in that same blob on every training autosave.
  const { data: existingSettings } = await supabase
    .from("user_settings")
    .select("notification_preferences")
    .eq("user_id", userId)
    .maybeSingle();

  await supabase.from("user_settings").upsert({
    user_id: userId,
    default_training_view: "week",
    notification_preferences: {
      ...(existingSettings?.notification_preferences as Record<string, unknown> | undefined),
      session_types: state.sessionTypes,
      training_preferences: state.preferences ?? null,
    },
  });

  await syncExercises(state);
}

export async function saveTrainingTemplate(
  template: Omit<SavedTrainingTemplate, "id"> & { id?: string }
): Promise<SavedTrainingTemplate | null> {
  const supabase = getSupabase();
  const userId = await getUserId();
  if (!supabase || !userId) return null;

  const id = template.id ?? createUuid();
  const { error } = await supabase.from("saved_templates").upsert({
    id,
    user_id: userId,
    name: template.name,
    template_type: template.templateType,
    description: template.description,
    payload: template.payload,
  });
  if (error) throw new Error(error.message);
  return { ...template, id };
}

async function syncExercises(state: TrainingPlannerState) {
  const supabase = getSupabase();
  const userId = await getUserId();
  if (!supabase || !userId) return;

  for (const session of state.sessions) {
    for (const [index, drill] of session.drills.entries()) {
      const name = drill.trim();
      if (!name) continue;

      const { data: exercise, error } = await supabase
        .from("exercises")
        .upsert(
          {
            user_id: userId,
            name,
            exercise_type: session.typeId,
            description: session.goals,
          },
          { onConflict: "user_id,name" }
        )
        .select("id")
        .single();

      if (error || !exercise) continue;

      await supabase.from("session_exercises").upsert({
        user_id: userId,
        workout_session_id: session.id,
        exercise_id: exercise.id,
        order_index: index,
        duration_minutes: Math.max(5, Math.round(session.duration / Math.max(1, session.drills.length))),
        notes: session.notes,
      });
    }
  }
}

export function createUuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
    const rand = Math.floor(Math.random() * 16);
    const value = char === "x" ? rand : (rand & 0x3) | 0x8;
    return value.toString(16);
  });
}
