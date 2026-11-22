import type { TypedSupabaseClient } from "@/lib/supabase/client";
import { isPermissionRefusal, type WriteRefusalContext } from "./write-error";

// Final-check verifier, MEDIUM 2 (2026-11-21). After a permission refusal
// (42501) on an S-10 write route, ask the caller's OWN profile row why —
// the same lookup app/api/training/sessions does — so an under-13 waiting
// for consent, or a Free account writing outreach, reads the reason and not
// "You don't have permission to do that." Nothing is asked otherwise, and
// the error's own text is never used: one single-row read by id (the
// family-scope rule), two columns.

export async function writeRefusalContext(
  supabase: TypedSupabaseClient,
  userId: string,
  err: unknown,
  opts: { needsPlayerPlan?: boolean } = {}
): Promise<WriteRefusalContext | null> {
  if (!isPermissionRefusal(err)) return null;
  try {
    const { data } = await supabase.from("profiles").select("consent_status, subscription_tier").eq("id", userId).maybeSingle();
    if (!data) return null;
    return refusalFromProfile(data, opts);
  } catch {
    return null;
  }
}

/** Pure: the reason from the caller's own two columns. Consent first — a
 *  pending under-13 is refused everything, whatever their plan. */
export function refusalFromProfile(
  profile: { consent_status?: string | null; subscription_tier?: string | null },
  opts: { needsPlayerPlan?: boolean } = {}
): WriteRefusalContext {
  return {
    consentPending: profile.consent_status === "pending",
    needsPlayerPlan: Boolean(opts.needsPlayerPlan) && (profile.subscription_tier ?? "free") === "free",
  };
}
