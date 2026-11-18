import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { getSupabase } from "@/lib/supabase/client";

// The Family plan lock (B4, migration 042).
//
// A family is UNLOCKED when any member — the parent who pays or the player
// who pays, in either membership shape — has subscription_tier 'family'.
// The database decides, and it is the database that enforces it: 042's
// restrictive RLS policies hide every other member's rows and the shared
// budget/notes/reports from a family that is not unlocked. This module only
// ASKS, so the UI can show the right screen and the API can refuse early
// with a sentence instead of a silent empty list.
//
// Downgrading never deletes anything. A locked family's rows are still
// there; re-upgrading makes them readable again.

/** Routes that show Family-plan data. The UI shows the upgrade screen on
 * these when loadFamilyPlanStatus() says locked. RLS is the real gate. */
export const FAMILY_PLAN_ROUTES = ["/family", "/family/budget", "/family/weekly-reports"] as const;

export type FamilyPlanRoute = (typeof FAMILY_PLAN_ROUTES)[number];

export interface FamilyPlanStatus {
  unlocked: boolean;
  familyCode: string | null;
  reason: "no-family" | "free" | "family";
}

/**
 * The status for whoever `supabase` is signed in as. Takes the client so the
 * API routes can pass their request-scoped one (lib/api-auth.ts
 * refuseUnlessFamilyPlan); the browser uses loadFamilyPlanStatus().
 *
 * Fails CLOSED: any error reads as locked ("free"), never as unlocked. A
 * locked screen on a network blip is recoverable; an unlocked one is a lie
 * the database would then contradict.
 */
export async function familyPlanStatusFor(
  supabase: SupabaseClient<Database>
): Promise<FamilyPlanStatus> {
  // Either membership shape (026's my_family_code()), never
  // profiles.family_code — a joiner's is NULL by design.
  const { data: code, error: codeError } = await supabase.rpc("my_family_code");
  const familyCode = !codeError && typeof code === "string" && code.length > 0 ? code : null;
  if (!familyCode) {
    return { unlocked: false, familyCode: null, reason: "no-family" };
  }

  const { data: unlocked, error } = await supabase.rpc("my_family_has_tier", { p_tier: "family" });
  if (error || unlocked !== true) {
    return { unlocked: false, familyCode, reason: "free" };
  }
  return { unlocked: true, familyCode, reason: "family" };
}

/** The signed-in browser user's Family-plan status. */
export async function loadFamilyPlanStatus(): Promise<FamilyPlanStatus> {
  const supabase = getSupabase();
  if (!supabase) return { unlocked: false, familyCode: null, reason: "no-family" };
  return familyPlanStatusFor(supabase);
}
