import { getAuthedUser, getSupabase } from "./client";

// Reuses the existing `user_settings.notification_preferences` JSONB column
// (also used by lib/supabase/design-preference.ts for design/seededMode and
// lib/supabase/training.ts for session types/training preferences) rather
// than new columns on `profiles` — no schema change needed for either of
// these two /settings toggles. Both readers below tolerate keys they don't
// own sitting alongside theirs in the same blob, same discipline as the
// other two callers.
export interface NotificationPrefs {
  weeklyDigest: boolean;
  schoolBandChange: boolean;
  followUpReminders: boolean;
  tournamentDeadlines: boolean;
  productNews: boolean;
}

// Matches "17 Settings + account.png": every toggle on except Product news —
// "Default is one weekly digest. Only coach replies and deadlines come
// right away."
export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  weeklyDigest: true,
  schoolBandChange: true,
  followUpReminders: true,
  tournamentDeadlines: true,
  productNews: false,
};

async function getUserId(): Promise<string | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  const { data } = await getAuthedUser(supabase);
  return data.user?.id ?? null;
}

async function loadBag(): Promise<Record<string, unknown> | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  const { data } = await supabase
    .from("user_settings")
    .select("notification_preferences")
    .maybeSingle();
  return (data?.notification_preferences as Record<string, unknown> | undefined) ?? null;
}

async function mergeIntoBag(patch: Record<string, unknown>): Promise<void> {
  const supabase = getSupabase();
  const userId = await getUserId();
  if (!supabase || !userId) return;

  // Read-then-merge so this write never clobbers keys it doesn't own (e.g.
  // design/seededMode, session_types, training_preferences).
  const { data: existing } = await supabase
    .from("user_settings")
    .select("notification_preferences")
    .eq("user_id", userId)
    .maybeSingle();

  await supabase.from("user_settings").upsert({
    user_id: userId,
    notification_preferences: {
      ...(existing?.notification_preferences as Record<string, unknown> | undefined),
      ...patch,
    },
  });
}

export async function loadNotificationPrefs(): Promise<NotificationPrefs> {
  const bag = await loadBag();
  const stored = bag?.notifications as Partial<NotificationPrefs> | undefined;
  return { ...DEFAULT_NOTIFICATION_PREFS, ...stored };
}

export async function saveNotificationPrefs(prefs: NotificationPrefs): Promise<void> {
  await mergeIntoBag({ notifications: prefs });
}

export async function loadPublicRecruitingPage(): Promise<boolean> {
  const bag = await loadBag();
  return Boolean(bag?.publicRecruitingPage);
}

export async function savePublicRecruitingPage(value: boolean): Promise<void> {
  await mergeIntoBag({ publicRecruitingPage: value });
}
