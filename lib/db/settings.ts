// Real data access behind /settings: the plan goal, the design/seededMode
// preference, the Whop
// membership lookup used by the billing tab, and account deletion.
// Moved verbatim from the former lib/supabase/settings-prefs.ts,
// lib/supabase/design-preference.ts, and lib/supabase/billing.ts. Account
// deletion lives here too — see deleteMyAccount() at the bottom and
// app/api/account/deletion/route.ts, the real server-validated path for it.
import { getAuthedUser, getSupabase } from "@/lib/supabase/client";
import type { TypedSupabaseClient } from "@/lib/supabase/client";
import type { DesignSystemId, SeededMode } from "@/lib/context/design-context";
import type { Json } from "./database.types";
import { parseBillingLookup, type BillingLookup } from "@/lib/billing-view";

async function getUserId(): Promise<string | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  const { data } = await getAuthedUser(supabase);
  return data.user?.id ?? null;
}

async function loadBag(): Promise<Record<string, unknown> | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  const userId = await getUserId();
  if (!userId) return null;
  // Own row, explicitly — see loadTrainingPlannerState in events.ts.
  const { data } = await supabase
    .from("user_settings")
    .select("notification_preferences")
    .eq("user_id", userId)
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
      ...((existing?.notification_preferences as Record<string, unknown> | undefined) ?? {}),
      ...patch,
    } as unknown as Json,
  });
}

/* ------------------------------------------------------------ plan goal */
// The UTR goal a player sets on /plan (C11). Lives in the same
// `user_settings.notification_preferences` bag as the rest of the player's
// own preferences — no migration, the same read-then-merge write, and it
// rides along in /api/account/export with the rest of user_settings.
// `null` means "no goal chosen": there is then no goal at all (lib/fit.ts
// resolvePlanGoal; PR D, D1 — it used to fall back to the estimate). A value outside the real UTR scale is ignored
// rather than trusted.

const PLAN_GOAL_KEY = "planGoalUtr";

export function parsePlanGoalUtr(raw: unknown): number | null {
  const n = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : NaN;
  if (!Number.isFinite(n) || n < 1 || n > 16.5) return null;
  return Math.round(n * 100) / 100;
}

export async function loadPlanGoalUtr(): Promise<number | null> {
  const bag = await loadBag();
  return parsePlanGoalUtr(bag?.[PLAN_GOAL_KEY]);
}

export async function savePlanGoalUtr(value: number | null): Promise<void> {
  await mergeIntoBag({ [PLAN_GOAL_KEY]: value == null ? null : parsePlanGoalUtr(value) });
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
// What /settings/billing needs from Whop, fetched read-only from
// /api/whop/membership (which only ever calls memberships.retrieve() — a
// GET, never a mutation). See lib/billing-view.ts for what each answer
// means. A failed request is "unreachable", never "none": "none" tells the
// person who pays that somebody else does, and a network blip must not.

export async function loadBillingLookup(): Promise<BillingLookup> {
  const supabase = getSupabase();
  const { data } = (await supabase?.auth.getSession()) ?? { data: { session: null } };
  const token = data.session?.access_token;
  if (!token) return { kind: "unreachable" };

  try {
    const res = await fetch("/api/whop/membership", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return { kind: "unreachable" };
    return parseBillingLookup(await res.json());
  } catch {
    return { kind: "unreachable" };
  }
}

/* -------------------------------------------------------- account deletion */
// P0-8. Real deletion, backed by public.delete_my_account() (migration 029):
// every row keyed on the account, plus the auth user itself, plus the family
// when the departing account was its last member. Not a soft delete and not
// a scheduled job — by the time this resolves, the account is gone.
//
// The RPC takes NO arguments. It reads auth.uid() and can delete nothing but
// its caller, which is why this never needs the service-role client that
// CLAUDE.md forbids for user-initiated writes. There is correspondingly
// nothing to get wrong here: no id to pass, no id to pass wrongly.
//
// The former requestAccountDeletion/cancelAccountDeletion pair is deleted.
// They wrote and cleared profiles.deletion_requested_at, which queued
// nothing; the column stays as the record of who asked while that flow was
// live (see the comment migration 029 puts on it) and the app no longer
// writes it.
export async function deleteMyAccount(
  supabase: TypedSupabaseClient
): Promise<{ familyDeleted: boolean }> {
  const { data, error } = await supabase.rpc("delete_my_account");
  if (error) throw new Error(error.message);
  const payload = (data ?? {}) as { status?: string; family_deleted?: boolean };
  if (payload.status !== "deleted") {
    throw new Error("Account deletion did not complete.");
  }
  return { familyDeleted: payload.family_deleted === true };
}
