import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  HEALTH_DB_CACHE_MS,
  HEALTH_DB_FAILURE_CACHE_MS,
  HEALTH_DB_TIMEOUT_MS,
  checkDatabaseReachable,
  healthResponseBody,
  resetHealthCacheForTests,
} from "./health";

// GET /api/health's logic (P1-OPS-2). No network: fetch is a fake.

const ENV = {
  NEXT_PUBLIC_SUPABASE_URL: "https://fakeproject.supabase.co/",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_FAKE",
};

function fakeFetch(impl: () => Promise<Response>) {
  return vi.fn(impl) as unknown as typeof fetch & ReturnType<typeof vi.fn>;
}

describe("checkDatabaseReachable", () => {
  beforeEach(() => resetHealthCacheForTests());

  it("asks Supabase Auth's public health endpoint with the publishable key — nothing else", async () => {
    const f = fakeFetch(async () => new Response("{}", { status: 200 }));
    expect(await checkDatabaseReachable({ env: ENV, fetchImpl: f })).toBe("ok");
    expect(f).toHaveBeenCalledTimes(1);
    const [url, init] = (f as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0];
    expect(url).toBe("https://fakeproject.supabase.co/auth/v1/health");
    expect(init.method).toBe("GET");
    expect(init.headers).toEqual({ apikey: "sb_publishable_FAKE" });
    expect(init.signal).toBeDefined();
  });

  it("is 'skipped' with no Supabase configuration, and makes no request", async () => {
    const f = fakeFetch(async () => new Response("{}"));
    expect(await checkDatabaseReachable({ env: {}, fetchImpl: f })).toBe("skipped");
    expect(f).not.toHaveBeenCalled();
  });

  it("is 'unreachable' on a non-2xx or a thrown fetch, and reports the failure once", async () => {
    const onFailure = vi.fn();
    const f503 = fakeFetch(async () => new Response("upstream text with fake@example.com", { status: 503 }));
    expect(await checkDatabaseReachable({ env: ENV, fetchImpl: f503, onFailure })).toBe("unreachable");
    expect(onFailure).toHaveBeenCalledTimes(1);
    // The upstream body is never read into the report.
    expect(JSON.stringify(onFailure.mock.calls[0][0])).not.toContain("example.com");

    resetHealthCacheForTests();
    const fThrow = fakeFetch(async () => {
      throw new Error("timeout");
    });
    expect(await checkDatabaseReachable({ env: ENV, fetchImpl: fThrow, onFailure })).toBe("unreachable");
    expect(onFailure).toHaveBeenCalledTimes(2);
  });

  it("pins the limits: 2 s timeout, 30 s success cache, 5 s failure cache", () => {
    expect(HEALTH_DB_TIMEOUT_MS).toBe(2_000);
    expect(HEALTH_DB_CACHE_MS).toBe(30_000);
    expect(HEALTH_DB_FAILURE_CACHE_MS).toBe(5_000);
  });

  it("caches a failure for only 5 s, so the uptime retry asks Supabase again", async () => {
    let t = 2_000_000;
    let up = false;
    const f = fakeFetch(async () => new Response("{}", { status: up ? 200 : 503 }));
    expect(await checkDatabaseReachable({ env: ENV, fetchImpl: f, now: () => t })).toBe("unreachable");
    t += HEALTH_DB_FAILURE_CACHE_MS - 1;
    expect(await checkDatabaseReachable({ env: ENV, fetchImpl: f, now: () => t })).toBe("unreachable");
    expect(f).toHaveBeenCalledTimes(1);
    up = true;
    t += 2;
    expect(await checkDatabaseReachable({ env: ENV, fetchImpl: f, now: () => t })).toBe("ok");
    expect(f).toHaveBeenCalledTimes(2);
  });

  it("caches the result for 30 s per instance, so it cannot be used to hammer Supabase", async () => {
    let t = 1_000_000;
    const f = fakeFetch(async () => new Response("{}", { status: 200 }));
    for (let i = 0; i < 50; i++) await checkDatabaseReachable({ env: ENV, fetchImpl: f, now: () => t });
    expect(f).toHaveBeenCalledTimes(1);
    t += HEALTH_DB_CACHE_MS - 1;
    await checkDatabaseReachable({ env: ENV, fetchImpl: f, now: () => t });
    expect(f).toHaveBeenCalledTimes(1);
    t += 2;
    await checkDatabaseReachable({ env: ENV, fetchImpl: f, now: () => t });
    expect(f).toHaveBeenCalledTimes(2);
  });

  it("concurrent callers share one in-flight request", async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => (release = r));
    const f = fakeFetch(async () => {
      await gate;
      return new Response("{}", { status: 200 });
    });
    const all = Promise.all(Array.from({ length: 20 }, () => checkDatabaseReachable({ env: ENV, fetchImpl: f })));
    release();
    expect(new Set(await all)).toEqual(new Set(["ok"]));
    expect(f).toHaveBeenCalledTimes(1);
  });
});

describe("healthResponseBody", () => {
  it("200 + ok:true when the database answers; short commit sha", () => {
    const r = healthResponseBody("ok", { VERCEL_GIT_COMMIT_SHA: "5c57deb1234567890abcdef1234567890abcdef0" });
    expect(r).toEqual({ status: 200, body: { ok: true, commit: "5c57deb", checks: { app: "ok", database: "ok" } } });
  });

  it("503 + ok:false when the database does not answer", () => {
    expect(healthResponseBody("unreachable", {})).toEqual({
      status: 503,
      body: { ok: false, commit: "local", checks: { app: "ok", database: "unreachable" } },
    });
  });

  it("'skipped' is fine locally and on previews, a failure on production", () => {
    expect(healthResponseBody("skipped", {}).status).toBe(200);
    expect(healthResponseBody("skipped", { VERCEL_ENV: "preview" }).status).toBe(200);
    expect(healthResponseBody("skipped", { VERCEL_ENV: "production" })).toMatchObject({ status: 503, body: { ok: false } });
  });

  it("commit is 'local' unless it looks like a git sha", () => {
    expect(healthResponseBody("ok", { VERCEL_GIT_COMMIT_SHA: "<script>" }).body.commit).toBe("local");
    expect(healthResponseBody("ok", { VERCEL_GIT_COMMIT_SHA: "" }).body.commit).toBe("local");
  });

  it("the body has exactly these keys — nothing upstream leaks into it", () => {
    const { body } = healthResponseBody("unreachable", { VERCEL_GIT_COMMIT_SHA: "abcdef1" });
    expect(Object.keys(body).sort()).toEqual(["checks", "commit", "ok"]);
    expect(Object.keys(body.checks).sort()).toEqual(["app", "database"]);
  });
});
