// Reading a Whop membership webhook payload.
//
// Extracted from app/api/whop/webhook/route.ts so that tests can call these
// FUNCTIONS instead of asserting that the route's source contains a given
// expression. An independent verifier showed why that mattered: the old
// test defined its own local copy of these readers and linked it to the
// route with a `readFileSync` + `toContain`. It therefore passed for a route
// rewritten to `return data.plan_id ?? null` with the old expression left in
// a comment, and FAILED for a behaviour-preserving refactor. It was checking
// a string.
//
// A route handler's exported surface is the HTTP method, so anything worth
// testing on its own has to live outside it. That is the lesson, not just
// the fix.

/** The membership object inside a `membership.*` webhook event.
 *
 * Field names confirmed against the live API at `api_version_date:
 * 2026-11-14`, the version webhook hook_ActwvOQFQX4Pm is pinned to. The
 * older names are accepted too, because a webhook pinned to an earlier
 * version sends them and two `??` is a cheap way to survive that. */
export interface MembershipEventData {
  id?: string;
  status?: string;
  /** The 2026-11-14 shape. Whop renamed plans to variants; the ids are
   * unchanged and still `plan_`-prefixed. */
  variant_id?: string;
  /** Pre-2026-11-14 shapes. */
  plan_id?: string;
  plan?: { id?: string } | null;
  metadata?: Record<string, unknown> | null;
  /** The live resource has no top-level email and `member` is often null, so
   * every path here is a maybe. The email fallback is best-effort by
   * design — see findProfileIdByEmail. */
  email?: string | null;
  user?: { email?: string | null } | null;
  member?: { email?: string | null; user?: { email?: string | null } | null } | null;
}

export interface MembershipEvent {
  type?: string;
  data?: MembershipEventData;
}

export const HANDLED_WEBHOOK_EVENTS = new Set([
  "membership.activated",
  "membership.updated",
  "membership.deactivated",
]);

/**
 * The plan a membership is on.
 *
 * `variant_id` FIRST. Getting this wrong is how the webhook fails silently:
 * the handler originally read `plan_id ?? plan?.id`, neither of which exists
 * in the 2026-11-14 resource, so every delivery would have resolved to
 * "unknown plan", granted nothing, and returned 200.
 */
export function planIdOf(data: MembershipEventData): string | null {
  return data.variant_id ?? data.plan_id ?? data.plan?.id ?? null;
}

/** The buyer's email, wherever this version of the payload puts it. Used
 * only as a fallback when checkout metadata is absent. */
export function emailOf(data: MembershipEventData): string | null {
  return (
    data.member?.email ?? data.member?.user?.email ?? data.user?.email ?? data.email ?? null
  );
}

/** The Seeded account id set by our own checkout, when there is one. */
export function supabaseUserIdOf(data: MembershipEventData): string | null {
  const value = data.metadata?.supabase_user_id;
  return typeof value === "string" && value.length > 0 ? value : null;
}
