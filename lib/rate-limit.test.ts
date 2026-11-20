import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  RATE_LIMIT_BUCKETS,
  consumeRateLimit,
  rateLimitMessage,
  rateLimited,
} from "./rate-limit";

// S-6. Two kinds of test here, and the first kind is the one that earns its
// keep: the limits live in SQL and the bucket names live in TypeScript, so
// the single most likely way this breaks is somebody adding a route with a
// bucket the migration never defined. The migration fails closed on an
// unknown bucket, which means that mistake ships as "you're doing that too
// fast" on the user's FIRST request — correct, but a terrible way to find
// out. So the lists are compared here instead.

// 034 is the source of truth now: it moved the policy out of
// consume_rate_limit's inlined CASE into rate_limit_for_bucket(), which the
// peek, the consume and the per-table trigger all read. Three callers of one
// CASE had to become a function, or the three would drift.
const MIGRATION = readFileSync(
  join(__dirname, "..", "supabase", "migrations", "034_enforce_rate_limits_in_database.sql"),
  "utf8"
);

/** Every `when '<bucket>' then <n>` in the migration's policy CASE. */
function bucketsDefinedInMigration(): Map<string, number> {
  const found = new Map<string, number>();
  const re = /when\s+'([a-z_]+)'\s+then\s+(\d+)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(MIGRATION)) !== null) {
    found.set(match[1], Number(match[2]));
  }
  return found;
}

describe("the bucket list matches migration 028", () => {
  it("defines a limit in SQL for every bucket the app can ask for", () => {
    const defined = bucketsDefinedInMigration();
    expect(defined.size).toBeGreaterThan(0);
    for (const bucket of RATE_LIMIT_BUCKETS) {
      expect(
        defined.has(bucket),
        `bucket "${bucket}" is used in app code but has no limit in 028_api_rate_limits.sql — ` +
          `the RPC fails closed on unknown buckets, so this route would reject every request`
      ).toBe(true);
    }
  });

  it("defines a limit for every bucket the per-table trigger can assign", () => {
    // The other direction, and it changed in 034. The app's bucket list is
    // now a SUBSET of the policy: the trigger assigns buckets for tables
    // that have no route of their own (daily_checkins, families, …), so a
    // policy entry with no matching route is expected rather than stale.
    //
    // What must hold is that every bucket the TRIGGER can produce has a
    // number — otherwise a write to that table raises "No rate-limit bucket
    // defined" at a real user.
    const defined = bucketsDefinedInMigration();
    const assigned = [...MIGRATION.matchAll(/when '[a-z_]+'\s+then '([a-z_]+)'/g)].map((m) => m[1]);
    expect(assigned.length, "could not find the table -> bucket mapping").toBeGreaterThan(10);
    for (const bucket of new Set(assigned)) {
      expect(
        defined.has(bucket),
        `the trigger assigns "${bucket}" but rate_limit_for_bucket() has no limit for it`
      ).toBe(true);
    }
  });

  it("limits every table a client can write directly", () => {
    // S-21: the whole point of 034. If a table is client-writable and has no
    // trigger, PostgREST is an unlimited write endpoint for it.
    // Parse the `targets constant text[] := array[ ... ]` block rather than
    // line-by-line: the migration packs several table names per line, so a
    // per-line regex silently matched almost nothing.
    const block = MIGRATION.slice(
      MIGRATION.indexOf("targets constant text[] := array["),
      MIGRATION.indexOf("];", MIGRATION.indexOf("targets constant text[] := array["))
    );
    const attached = [...block.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
    expect(attached.length, "could not parse the trigger target list").toBeGreaterThan(15);
    for (const table of ["profiles", "utr_entries", "matches", "coach_outreach", "user_settings"]) {
      expect(attached, `${table} has no rate-limit trigger`).toContain(table);
    }
  });

  it("gives the destructive and expensive buckets the tightest limits", () => {
    const defined = bucketsDefinedInMigration();
    const deletion = defined.get("account_deletion")!;
    const exportData = defined.get("data_export")!;
    expect(deletion).toBeLessThanOrEqual(10);
    expect(exportData).toBeLessThanOrEqual(10);
    // Routine edits must stay comfortably above them, or normal use trips.
    expect(defined.get("profile_write")!).toBeGreaterThan(deletion);
  });
});

describe("a refused request is explained, not coded at the user", () => {
  it("never shows a status code, a bucket name or a policy", () => {
    for (const seconds of [1, 60, 90, 300, 3600, 7200]) {
      const message = rateLimitMessage(seconds);
      expect(message).not.toMatch(/429|bucket|limit|rate/i);
      expect(message).toMatch(/try again/i);
    }
  });

  it("rounds the wait up to something a person can act on", () => {
    expect(rateLimitMessage(45)).toContain("in a minute");
    expect(rateLimitMessage(300)).toContain("5 minutes");
    expect(rateLimitMessage(3600)).toContain("an hour");
  });
});

// A stub shaped like the one `.rpc()` call this module makes. It RECORDS the
// function name: an independent review pointed out that the previous stub
// ignored it, so changing `peek_rate_limit` back to `consume_rate_limit` left
// all eleven tests green — and that one word is the whole of 034's
// double-counting design. The route peeks; only the table trigger consumes.
// If both consumed, every API write would count twice and halve the limit.
function stubClient(response: { data?: unknown; error?: unknown }) {
  const calls: string[] = [];
  const client = {
    rpc: async (fn: string) => {
      calls.push(fn);
      return { data: response.data ?? null, error: response.error ?? null };
    },
    calls,
  };
  return client as unknown as import("@supabase/supabase-js").SupabaseClient<
    import("./db/database.types").Database
  > & { calls: string[] };
}

describe("the route peeks and never consumes", () => {
  it("calls peek_rate_limit, not consume_rate_limit", async () => {
    const client = stubClient({ data: { allowed: true, remaining: 5 } });
    await consumeRateLimit(client, "utr_entry");
    expect(client.calls).toEqual(["peek_rate_limit"]);
    // Stated as its own assertion so the failure message says why it matters.
    expect(
      client.calls,
      "the API routes must PEEK; 034's per-table trigger is the only counter"
    ).not.toContain("consume_rate_limit");
  });

  it("CONSUMES for the three buckets that have no table behind them", async () => {
    // These describe an action, not a table write, so no trigger ever fires
    // for them. Peeking at a counter nothing increments means no limit at
    // all — which is what /api/account/export had: a full JSON dump of
    // everything stored about a person, with a declared limit of 3/hour
    // that was never enforced.
    for (const bucket of ["account_deletion", "data_export", "whop_checkout"] as const) {
      const client = stubClient({ data: { allowed: true, remaining: 1 } });
      await consumeRateLimit(client, bucket);
      expect(client.calls, bucket).toEqual(["consume_rate_limit"]);
    }
  });

  it("PEEKS for every bucket a table trigger counts", async () => {
    for (const bucket of [
      "profile_write",
      "utr_entry",
      "match_write",
      "outreach_write",
      "budget_write",
      "training_write",
    ] as const) {
      const client = stubClient({ data: { allowed: true, remaining: 5 } });
      await consumeRateLimit(client, bucket);
      expect(client.calls, bucket).toEqual(["peek_rate_limit"]);
    }
  });

  it("every bucket is either counted by a route or by a table trigger", async () => {
    // The partition must be total: a bucket in neither set is unlimited,
    // which is the bug this pair of tests exists to prevent.
    const triggerBuckets = new Set([
      "profile_write", "utr_entry", "match_write", "outreach_write",
      "budget_write", "training_write",
    ]);
    const routeBuckets = new Set(["account_deletion", "data_export", "whop_checkout"]);
    for (const bucket of RATE_LIMIT_BUCKETS) {
      expect(
        triggerBuckets.has(bucket) || routeBuckets.has(bucket),
        `${bucket} is counted by nothing`
      ).toBe(true);
    }
  });

  it("peeks exactly once per check", async () => {
    const client = stubClient({ data: { allowed: true, remaining: 5 } });
    await consumeRateLimit(client, "profile_write");
    expect(client.calls).toHaveLength(1);
  });
});

describe("the limiter fails closed", () => {
  it("refuses when the RPC errors", async () => {
    // A revoked grant, a missing migration, a dropped connection. Opening the
    // gates whenever Postgres is unhappy would make this not a limiter.
    const verdict = await consumeRateLimit(stubClient({ error: { message: "boom" } }), "utr_entry");
    expect(verdict.allowed).toBe(false);
    expect(verdict.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("refuses when the RPC returns something unexpected", async () => {
    for (const data of [null, "yes", 1, []]) {
      const verdict = await consumeRateLimit(stubClient({ data }), "utr_entry");
      expect(verdict.allowed).toBe(false);
    }
  });

  it("only allows on an explicit allowed:true", async () => {
    expect((await consumeRateLimit(stubClient({ data: { allowed: true } }), "utr_entry")).allowed).toBe(
      true
    );
    expect(
      (await consumeRateLimit(stubClient({ data: { allowed: "true" } }), "utr_entry")).allowed
    ).toBe(false);
    expect((await consumeRateLimit(stubClient({ data: {} }), "utr_entry")).allowed).toBe(false);
  });
});

describe("the 429 a route returns", () => {
  it("is null when the request may proceed", async () => {
    expect(await rateLimited(stubClient({ data: { allowed: true } }), "match_write")).toBeNull();
  });

  it("carries Retry-After and the same { error } shape every route uses", async () => {
    const response = await rateLimited(
      stubClient({ data: { allowed: false, retry_after_seconds: 120 } }),
      "match_write"
    );
    expect(response).not.toBeNull();
    expect(response!.status).toBe(429);
    expect(response!.headers.get("retry-after")).toBe("120");
    const body = (await response!.json()) as { error?: string };
    expect(body.error).toMatch(/try again/i);
  });
});
