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

const MIGRATION = readFileSync(
  join(__dirname, "..", "supabase", "migrations", "028_api_rate_limits.sql"),
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

  it("has no SQL limit for a bucket no route uses", () => {
    // A stale entry is harmless but means the policy no longer describes the
    // product. Both directions, so the two lists cannot drift apart.
    for (const bucket of bucketsDefinedInMigration().keys()) {
      expect(
        (RATE_LIMIT_BUCKETS as readonly string[]).includes(bucket),
        `028_api_rate_limits.sql defines "${bucket}" but no route asks for it`
      ).toBe(true);
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

// A stub shaped like the one `.rpc()` call this module makes.
function stubClient(response: { data?: unknown; error?: unknown }) {
  return {
    rpc: async () => ({ data: response.data ?? null, error: response.error ?? null }),
    // Shaped to the one call this module makes, not to the whole client.
  } as any;
}

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
