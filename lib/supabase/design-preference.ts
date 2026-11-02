import type { DesignSystemId, SeededMode } from "@/lib/context/design-context";
import { getAuthedUser, getSupabase } from "./client";

export interface DesignPreference {
  design: DesignSystemId;
  seededMode: SeededMode;
}

async function getUserId(): Promise<string | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  const { data } = await getAuthedUser(supabase);
  return data.user?.id ?? null;
}

// Reuses the existing `user_settings.notification_preferences` JSONB
// column (also used by lib/supabase/training.ts for session types/training
// preferences) rather than a new column — no schema change. Both readers
// tolerate keys they don't own sitting alongside theirs in the same blob.
export async function loadDesignPreference(): Promise<Partial<DesignPreference> | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  const { data } = await supabase
    .from("user_settings")
    .select("notification_preferences")
    .maybeSingle();
  const prefs = data?.notification_preferences as Record<string, unknown> | undefined;
  if (!prefs) return null;
  const design = prefs.design;
  const seededMode = prefs.seededMode;
  return {
    design: design === "legacy" || design === "seeded" ? design : undefined,
    seededMode: seededMode === "dark" || seededMode === "light" ? seededMode : undefined,
  };
}

export async function saveDesignPreference(pref: DesignPreference): Promise<void> {
  const supabase = getSupabase();
  const userId = await getUserId();
  if (!supabase || !userId) return;

  // Read-then-merge so this write never clobbers keys it doesn't own
  // (session_types/training_preferences written by saveTrainingPlannerState)
  // — the same discipline that function now follows for this key.
  const { data: existing } = await supabase
    .from("user_settings")
    .select("notification_preferences")
    .eq("user_id", userId)
    .maybeSingle();

  await supabase.from("user_settings").upsert({
    user_id: userId,
    notification_preferences: {
      ...(existing?.notification_preferences as Record<string, unknown> | undefined),
      design: pref.design,
      seededMode: pref.seededMode,
    },
  });
}
