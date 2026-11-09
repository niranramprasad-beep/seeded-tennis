// Real data access behind /settings: notification toggles, the "Public
// recruiting page" toggle, the design/seededMode preference, the Whop
// membership snapshot used by the billing tab, and account deletion.
// Moved verbatim from the former lib/supabase/settings-prefs.ts,
// lib/supabase/design-preference.ts, and lib/supabase/billing.ts. Account
// deletion is NEW here — it previously had no dedicated write path, only
// going through the generic saveCurrentPlayer()/updatePlayer() profile-patch
// in lib/auth.ts; see requestAccountDeletion/cancelAccountDeletion below and
// app/api/account/deletion/route.ts, the real server-validated path for it.
import { getAuthedUser, getSupabase } from "@/lib/supabase/client";
import type { TypedSupabaseClient } from "@/lib/supabase/client";
import type { DesignSystemId, SeededMode } from "@/lib/context/design-context";
import type { Json } from "./database.types";

async function getUserId(): Promise<string | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  const { data } = await getAuthedUser(supabase);
  return data.user?.id ?? null;
}

/* ------------------------------------------------------- notification prefs */
// Reuses the existing `user_settings.notification_preferences` JSONB column
// (also used below for design/seededMode, and by lib/db/events.ts for
// session types/training preferences) rather than new columns on
// `profiles` — no schema change needed for either of these two /settings
// toggles. Both readers tolerate keys they don't own sitting alongside
// theirs in the same blob, same discipline as the other callers.

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

async function loadBag(): Promise<Record<string, unknown> | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  const { data } = await supabase.from("user_settings").select("notification_preferences").maybeSingle();
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
      ...((existing?.notification_preferences as Record<string, unknown> | undefined) ?? {}),
      ...patch,
    } as unknown as Json,
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

/* ------------------------------------------------------- design preference */

export interface DesignPreference {
  design: DesignSystemId;
  seededMode: SeededMode;
}

// Reuses the same `user_settings.notification_preferences` JSONB column as
// above — no schema change. Both readers tolerate keys they don't own
// sitting alongside theirs in the same blob.
export async function loadDesignPreference(): Promise<Partial<DesignPreference> | null> {
  const bag = await loadBag();
  if (!bag) return null;
  const design = bag.design;
  const seededMode = bag.seededMode;
  return {
    design: design === "legacy" || design === "seeded" ? design : undefined,
    seededMode: seededMode === "dark" || seededMode === "light" ? seededMode : undefined,
  };
}

export async function saveDesignPreference(pref: DesignPreference): Promise<void> {
  await mergeIntoBag({ design: pref.design, seededMode: pref.seededMode });
}

/* ------------------------------------------------------------------ billing */
// The few live-Whop fields Supabase never stores (profiles only has
// subscription_tier + whop_membership_id — see migration
// 008_whop_billing.sql). Fetched read-only from /api/whop/membership,
// which itself only ever calls memberships.retrieve() — a GET, never a
// mutation. null means "no renewal date / no membership-specific portal
// link available" (free tier, Whop not configured, or the API call
// failed) — every caller must treat that as a valid, non-error state and
// fall back to the generic plan/portal display, never invent a date.

export interface MembershipSnapshot {
  status: string;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  manageUrl: string | null;
}

export async function loadMembershipSnapshot(): Promise<MembershipSnapshot | null> {
  const supabase = getSupabase();
  const { data } = (await supabase?.auth.getSession()) ?? { data: { session: null } };
  const token = data.session?.access_token;
  if (!token) return null;

  try {
    const res = await fetch("/api/whop/membership", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const payload = await res.json();
    return payload.membership ?? null;
  } catch {
    return null;
  }
}

/* -------------------------------------------------------- account deletion */
// Soft-delete-with-grace-period, backed by `profiles.deletion_requested_at`
// (migration 014_profile_fields_and_deletion.sql — not yet applied, see
// that file's header). Setting it never hard-deletes anything itself — the
// real 30-day purge is a separate operational job outside the app's scope;
// the UI just shows "Deletion scheduled for {date} — Cancel" while it's
// set. This is the one account-deletion write path the app has — flagged
// explicitly as a destructive, highest-priority write to move behind real
// validation (see app/api/account/deletion/route.ts), unlike the dozen
// other profile fields that still go through lib/auth.ts's generic
// saveCurrentPlayer()/updatePlayer() patch.
//
// Both functions take an explicit `{ supabase, userId }` pair rather than
// resolving their own via the browser session — they're written to be
// called from a server route handler with a request-scoped, RLS-respecting
// client (lib/api-auth.ts's getRequestScopedSupabase), which is the only
// real caller; there's no optimistic browser-direct equivalent to preserve
// here the way the other ctx-accepting functions in lib/db/outreach.ts and
// lib/db/family.ts have.
export async function requestAccountDeletion(
  supabase: TypedSupabaseClient,
  userId: string
): Promise<void> {
  const { error } = await supabase
    .from("profiles")
    .update({ deletion_requested_at: new Date().toISOString() })
    .eq("id", userId);
  if (error) throw new Error(error.message);
}

export async function cancelAccountDeletion(supabase: TypedSupabaseClient, userId: string): Promise<void> {
  const { error } = await supabase.from("profiles").update({ deletion_requested_at: null }).eq("id", userId);
  if (error) throw new Error(error.message);
}
