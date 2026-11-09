import { getSupabase } from "./client";

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
