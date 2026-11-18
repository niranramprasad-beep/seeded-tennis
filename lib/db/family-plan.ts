// Does this family have the Family plan? The one question the parent pages
// ask before they show anything.
//
// CONTRACT (PR B): the database engineer owns this file. This is the app
// side's placeholder with the agreed signature; at merge, their version wins.
//
// The paywall this drives is NOT the control. RLS refuses budget, notes and
// report rows — and a parent's reads of their player's rows — unless the
// family has a Family plan. The UI asks first only so a locked family sees a
// calm "this is part of Family" page instead of a dashboard of empty cards
// that reads as "you have no data".

import { getSupabase } from "@/lib/supabase/client";
import { resolveMyFamilyCode } from "./family-scope";

/** The parent pages the Family plan unlocks. */
export const FAMILY_PLAN_ROUTES = ["/family", "/family/budget", "/family/weekly-reports"] as const;

export interface FamilyPlanStatus {
  unlocked: boolean;
  familyCode: string | null;
  reason: "no-family" | "free" | "family";
}

const NO_FAMILY: FamilyPlanStatus = { unlocked: false, familyCode: null, reason: "no-family" };

export async function loadFamilyPlanStatus(): Promise<FamilyPlanStatus> {
  const supabase = getSupabase();
  if (!supabase) return NO_FAMILY;
  // Across both membership shapes (creator / joiner) — never profiles.family_code.
  const familyCode = await resolveMyFamilyCode(supabase);
  if (!familyCode) return NO_FAMILY;

  // `my_family_has_tier` arrives with the database half of PR B, so the
  // generated types do not know it yet.
  const rpc = supabase.rpc as unknown as (
    fn: string,
    args: Record<string, unknown>
  ) => PromiseLike<{ data: unknown; error: unknown }>;
  const { data, error } = await rpc.call(supabase, "my_family_has_tier", { p_tier: "family" });
  // Fails closed, like the RLS it mirrors: if the question cannot be
  // answered, the family's rows are not readable either.
  if (error || data !== true) return { unlocked: false, familyCode, reason: "free" };
  return { unlocked: true, familyCode, reason: "family" };
}
