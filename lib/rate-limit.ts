import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/database.types";

// S-6 (P1-SEC-3). The counter itself is in Postgres — see
// supabase/migrations/028_api_rate_limits.sql for why it has to be, and why
// the per-bucket limits live inside the SQL function rather than being
// passed in from here. The short version: a module-scope Map counts one
// Vercel instance's requests, and the arguments to an RPC are under the
// caller's control.
//
// This file is the thin app-side half: name a bucket, get an answer, turn a
// refusal into a 429 the UI can show a person.

/** Every bucket `consume_rate_limit` knows about. Keep in lockstep with the
 * CASE in migration 028 — an unknown bucket is denied there (fail closed),
 * so a typo shows up as "you're doing that too fast" on the very first
 * request rather than as a silently missing limit. `lib/rate-limit.test.ts`
 * asserts this list matches the migration. */
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
  return `That's a lot of changes at once — try again ${minutesPhrase(retryAfterSeconds)}.`;
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
  const { data, error } = await supabase.rpc("consume_rate_limit", { p_bucket: bucket });

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
