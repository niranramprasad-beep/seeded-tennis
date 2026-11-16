import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/database.types";

// S-6 (P1-SEC-3) / S-21. The counter is in Postgres — see migration 028 for
// why it has to be (a module-scope Map counts one Vercel instance), and why
// the limits live inside SQL rather than being passed in (RPC arguments are
// under the caller's control).
//
// **Enforcement is migration 034's per-table trigger, not this file.** An
// independent review pointed out that `authenticated` holds table-level
// INSERT/UPDATE/DELETE, so a client with the same bearer token can POST
// straight to /rest/v1/<table> and never reach a route — which made every
// limit here advisory. The trigger runs on the table, so the limit is a
// property of the data rather than of the path taken to it.
//
// What is left in this file is the courtesy layer: ask whether the next
// write would be refused, and if so say so in English before attempting it.

/** Every bucket the API routes name. The full policy — these plus the
 * table-trigger buckets from 034 — lives in `rate_limit_for_bucket()`.
 * An unknown bucket is denied (fail closed), so a typo shows up as "you're
 * doing that too fast" on the first request rather than as a silently
 * missing limit. `lib/rate-limit.test.ts` asserts this list is a subset of
 * the SQL policy. */
export const RATE_LIMIT_BUCKETS = [
  "profile_write",
  "utr_entry",
  "match_write",
  "outreach_write",
  "budget_write",
  "training_write",
  "account_deletion",
  "data_export",
  "whop_checkout",
] as const;

export type RateLimitBucket = (typeof RATE_LIMIT_BUCKETS)[number];

/** Buckets with NO table behind them, which the route must therefore COUNT
 * rather than peek at.
 *
 * 034 moved enforcement to per-table triggers and switched every route to
 * `peek_rate_limit`, which only reads. That is right for a bucket whose
 * table carries the trigger — counting in both places would halve the real
 * limit. It is wrong for these three: they describe an ACTION, not a table
 * write, so no trigger ever fires and `v_used` stayed 0 forever.
 *
 * A verification pass found the result: `/api/account/export` — a full JSON
 * dump of everything stored about a person — had no rate limit at all,
 * while `rate_limit_for_bucket` still declared 3/hour for it and the code
 * read as though that were enforced.
 *
 * `account_deletion` and `whop_checkout` were in the same state. */
const ROUTE_COUNTED_BUCKETS = new Set<RateLimitBucket>([
  "account_deletion",
  "data_export",
  "whop_checkout",
]);

export interface RateLimitVerdict {
  allowed: boolean;
  retryAfterSeconds: number;
}

function minutesPhrase(seconds: number): string {
  if (seconds <= 90) return "in a minute";
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) return `in about ${minutes} minutes`;
  const hours = Math.ceil(minutes / 60);
  return hours === 1 ? "in about an hour" : `in about ${hours} hours`;
}

/** Friendly, specific, and honest about the wait. No "429" and no mention of
 * limits-per-hour: the person doesn't need our policy, they need to know
 * when to try again. */
export function rateLimitMessage(retryAfterSeconds: number): string {
  return `You've done that a lot in a short time — try again ${minutesPhrase(retryAfterSeconds)}.`;
}

/**
 * Records one attempt against `bucket` for the calling user and says whether
 * it is allowed.
 *
 * Fails CLOSED when the RPC itself errors (network, a missing migration, a
 * revoked grant). An abuse control that opens when its backend hiccups is
 * not one, and the alternative — letting unlimited writes through whenever
 * Postgres is unhappy — is strictly worse than a user seeing "try again in a
 * minute". The one exception is a missing session, which the caller has
 * already turned into a 401 before getting here.
 */
export async function consumeRateLimit(
  supabase: SupabaseClient<Database>,
  bucket: RateLimitBucket
): Promise<RateLimitVerdict> {
  // `peek`, not `consume`. Since migration 034 the authoritative counter is
  // a BEFORE-write trigger on each table, which runs however the write
  // arrives — our route, PostgREST, or an endpoint nobody has written yet.
  // If this consumed as well, every API write would count twice and halve
  // the real limit.
  //
  // So this call is manners, not enforcement: it lets a user see a friendly
  // 429 before the work is attempted, instead of a raw database error
  // after. Removing it would weaken the message, not the limit.
  // Peek where a table trigger counts; consume where nothing else will.
  const fn = ROUTE_COUNTED_BUCKETS.has(bucket) ? "consume_rate_limit" : "peek_rate_limit";
  const { data, error } = await supabase.rpc(fn, { p_bucket: bucket });

  if (error || !data || typeof data !== "object") {
    return { allowed: false, retryAfterSeconds: 60 };
  }

  const payload = data as { allowed?: unknown; retry_after_seconds?: unknown };
  const allowed = payload.allowed === true;
  const retry = Number(payload.retry_after_seconds);
  return {
    allowed,
    retryAfterSeconds: Number.isFinite(retry) && retry > 0 ? Math.ceil(retry) : 60,
  };
}

/**
 * The shape every write route uses:
 *
 *   const limited = await rateLimited(ctx.supabase, "utr_entry");
 *   if (limited) return limited;
 *
 * Returns `null` when the request may proceed, or a ready-made 429 with a
 * `Retry-After` header when it may not. Routes return the response as-is so
 * the error body matches every other route's `{ error }` contract and
 * lib/api-client.ts surfaces it without a special case.
 */
export async function rateLimited(
  supabase: SupabaseClient<Database>,
  bucket: RateLimitBucket
): Promise<NextResponse | null> {
  const verdict = await consumeRateLimit(supabase, bucket);
  if (verdict.allowed) return null;
  return NextResponse.json(
    { error: rateLimitMessage(verdict.retryAfterSeconds) },
    { status: 429, headers: { "retry-after": String(verdict.retryAfterSeconds) } }
  );
}
