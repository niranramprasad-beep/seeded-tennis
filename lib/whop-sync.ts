import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/database.types";
import { TIER_RANK, type SubscriptionTier } from "@/lib/types";
import { tierForPlanId } from "@/lib/whop";

// The single place a Whop membership becomes a `subscription_tier` on a
// profile. Two callers:
//
//   app/api/whop/webhook  — Whop telling us, which is how it should work
//   app/api/whop/sync     — us asking Whop on the user's return from
//                           checkout, which is how it works when the webhook
//                           has not arrived
//
// They existed as one code path and a wish before; now they are one code
// path. The guard below is subtle enough that having two copies of it was
// going to produce two behaviours.

/** Statuses that mean the person currently has access. */
export const ACCESS_GRANTING_STATUSES = new Set(["active", "trialing", "completed"]);

export interface MembershipFacts {
  /** The Supabase account this membership belongs to. */
  supabaseUserId: string;
  /** `mem_...` */
  membershipId: string;
  /** `plan_...`, or null if the payload did not carry one. */
  planId: string | null;
  /** Whop's lifecycle status for the membership. */
  status: string;
}

export type ApplyOutcome =
  | { applied: true; tier: SubscriptionTier; reason: "granted" }
  | { applied: true; tier: "free"; reason: "revoked" }
  | { applied: false; reason: "already-current" }
  | { applied: false; reason: "would-downgrade-active-membership" }
  | { applied: false; reason: "not-this-users-membership" }
  | { applied: false; reason: "unknown-plan" }
  | { applied: false; reason: "write-failed" };

/**
 * Applies one membership's facts to a profile, idempotently.
 *
 * The guard it carries, and why — this is the part worth reading:
 *
 * 1. **A stale event must not downgrade a live subscription.** Confirmed on
 *    production: an account ended up on Player with no corresponding
 *    downgrade in Whop, consistent with a replayed event for a superseded
 *    membership overwriting the correct tier. So an access-granting event
 *    only applies when it is the SAME membership already on record, there is
 *    no membership on record, or it is a genuine upgrade.
 * 2. **A cancellation only applies to the membership it is about.** A person
 *    can hold more than one over time — tried Family, canceled it, still on
 *    Player — and the cancel of the old one must not revoke the new one. The
 *    revoke is therefore scoped by `whop_membership_id` in the WHERE clause,
 *    not just by user.
 * 3. **An unknown plan grants nothing and revokes nothing.** If a plan id is
 *    missing from the environment the honest answer is "I don't know what
 *    this is", and both acting on it and ignoring it silently are wrong —
 *    so it returns a distinguishable reason the caller can log.
 *
 * Idempotency is the point: calling this twice with the same facts makes the
 * second call a no-op, which is what makes the post-checkout sync safe to run
 * on every page load that carries `?checkout=success`.
 */
export async function applyMembershipToProfile(
  admin: SupabaseClient<Database>,
  facts: MembershipFacts
): Promise<ApplyOutcome> {
  const granting = ACCESS_GRANTING_STATUSES.has(facts.status);

  if (granting) {
    const newTier = tierForPlanId(facts.planId);
    if (newTier === "free") {
      // Reached when the plan id is absent or not one of ours. Never write:
      // "I can't identify this plan" is not a reason to take access away.
      return { applied: false, reason: "unknown-plan" };
    }

    const { data: current } = await admin
      .from("profiles")
      .select("subscription_tier, whop_membership_id")
      .eq("id", facts.supabaseUserId)
      .maybeSingle();

    const currentTier = (current?.subscription_tier as SubscriptionTier | undefined) ?? "free";
    const isSameMembership = current?.whop_membership_id === facts.membershipId;

    if (isSameMembership && currentTier === newTier) {
      return { applied: false, reason: "already-current" };
    }

    const isUpgradeOrFirstTime =
      !current?.whop_membership_id || TIER_RANK[newTier] >= TIER_RANK[currentTier];

    if (!isSameMembership && !isUpgradeOrFirstTime) {
      return { applied: false, reason: "would-downgrade-active-membership" };
    }

    const { error } = await admin
      .from("profiles")
      .update({ subscription_tier: newTier, whop_membership_id: facts.membershipId })
      .eq("id", facts.supabaseUserId);

    if (error) return { applied: false, reason: "write-failed" };
    return { applied: true, tier: newTier, reason: "granted" };
  }

  // Not access-granting: a cancel, expiry or failed payment.
  const { data, error } = await admin
    .from("profiles")
    .update({ subscription_tier: "free" })
    .eq("id", facts.supabaseUserId)
    .eq("whop_membership_id", facts.membershipId)
    .select("id");

  if (error) return { applied: false, reason: "write-failed" };
  if (!data || data.length === 0) {
    // The user is not on this membership any more — it is an old one being
    // tidied up. Correct outcome, not an error.
    return { applied: false, reason: "not-this-users-membership" };
  }
  return { applied: true, tier: "free", reason: "revoked" };
}

/**
 * Finds the Supabase account for a Whop buyer when checkout metadata did not
 * carry one.
 *
 * Why this exists: every checkout WE start sets `metadata.supabase_user_id`,
 * but not every membership comes from our checkout. A purchase made from
 * Whop's own product page, a plan shared as a link, a membership created by
 * hand in the dashboard, or a gift all arrive with no metadata — and the
 * webhook's old behaviour was to do nothing at all and return 200, so the
 * person paid and got nothing, silently.
 *
 * Why it is a fallback and not the primary path: email is a weak identifier.
 * People buy with a different address than they signed up with, and matching
 * on it is a guess. So it is tried only when metadata is absent, it must
 * match exactly one profile, and the caller logs when it does and when it
 * cannot.
 *
 * Returns null when there is no email, no match, or more than one match.
 * Ambiguity resolves to "do nothing", never to "pick the first" — granting a
 * paid tier to the wrong account is worse than granting it late.
 */
/** Escapes the three characters Postgres treats specially in a LIKE pattern,
 * so a value supplied by someone else is matched literally. Backslash first,
 * or it would escape the escapes added after it. */
export function escapeLikePattern(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

export async function findProfileIdByEmail(
  admin: SupabaseClient<Database>,
  email: string | null | undefined
): Promise<string | null> {
  if (!email) return null;
  const normalized = email.trim().toLowerCase();
  if (!normalized) return null;

  // The email comes from Whop — i.e. from whoever bought the membership —
  // and PostgREST's `ilike` treats `%` and `_` as WILDCARDS. A membership
  // bought as `%@gmail.com` matched a stranger's profile and attached a paid
  // tier to their account. The `limit(2)` ambiguity check below does not
  // save it: a pattern matching exactly one row looks like a clean,
  // unambiguous match.
  //
  // Escaped rather than switched to `.eq()`, because the match has to stay
  // case-insensitive: `profiles.email` is written from the signup form
  // verbatim, so it can be mixed case, and `.eq()` against a lowercased
  // needle would silently stop matching those rows. Failing to match is the
  // safer direction, but it is still wrong.
  const { data, error } = await admin
    .from("profiles")
    .select("id")
    .ilike("email", escapeLikePattern(normalized))
    .limit(2);

  if (error || !data || data.length !== 1) return null;
  return data[0].id;
}
