// The logic behind GET /api/health (app/api/health/route.ts), kept here so
// lib/health.test.ts can drive it without a server.
//
// The "database" check is deliberately the cheapest honest question we can
// ask without credentials that matter: Supabase Auth's public health
// endpoint, `${NEXT_PUBLIC_SUPABASE_URL}/auth/v1/health`, with the
// publishable (anon) key that every browser already holds. It reads no table
// and needs no service role.
//
// Be exact about what it proves: the Supabase project is up and answering
// from where this deployment runs. It does NOT prove a given query would
// succeed (RLS, a bad migration, a slow query). Its name, `database`, is the
// contract the uptime workflow reads; docs/TECHNICAL_ARCHITECTURE.md
// "Monitoring" says what it means.

export type DatabaseCheck = "ok" | "unreachable" | "skipped";

export const HEALTH_DB_TIMEOUT_MS = 2_000;
export const HEALTH_DB_CACHE_MS = 30_000;
/** A failure is cached briefly: long enough that a burst of calls during an
 * outage still makes one upstream request per instance, short enough that
 * the uptime workflow's retry (10 s later) asks Supabase again rather than
 * re-reading a stale "unreachable". */
export const HEALTH_DB_FAILURE_CACHE_MS = 5_000;

interface CacheEntry {
  at: number;
  result: DatabaseCheck;
}

// Per serverless instance. At most one upstream request per instance per
// HEALTH_DB_CACHE_MS after a success (HEALTH_DB_FAILURE_CACHE_MS after a
// failure), however often /api/health is called, and concurrent callers
// share one in-flight request.
let cache: CacheEntry | null = null;
let inflight: Promise<DatabaseCheck> | null = null;

/** Test-only: forget the cached result. */
export function resetHealthCacheForTests(): void {
  cache = null;
  inflight = null;
}

export interface DatabaseCheckOptions {
  env?: Record<string, string | undefined>;
  fetchImpl?: typeof fetch;
  now?: () => number;
  /** Called once per fresh (uncached) failure — the route logs it. */
  onFailure?: (err: unknown) => void;
}

export async function checkDatabaseReachable(opts: DatabaseCheckOptions = {}): Promise<DatabaseCheck> {
  const env = opts.env ?? process.env;
  const now = opts.now ?? Date.now;

  if (cache) {
    const ttl = cache.result === "unreachable" ? HEALTH_DB_FAILURE_CACHE_MS : HEALTH_DB_CACHE_MS;
    if (now() - cache.at < ttl) return cache.result;
  }
  if (inflight) return inflight;

  inflight = (async () => {
    const result = await probe(env, opts.fetchImpl ?? fetch, opts.onFailure);
    cache = { at: now(), result };
    return result;
  })();
  try {
    return await inflight;
  } finally {
    inflight = null;
  }
}

async function probe(
  env: Record<string, string | undefined>,
  fetchImpl: typeof fetch,
  onFailure?: (err: unknown) => void
): Promise<DatabaseCheck> {
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return "skipped";

  try {
    const res = await fetchImpl(`${url.replace(/\/+$/, "")}/auth/v1/health`, {
      method: "GET",
      headers: { apikey: key },
      cache: "no-store",
      signal: AbortSignal.timeout(HEALTH_DB_TIMEOUT_MS),
    });
    if (res.ok) return "ok";
    // The status only — the body is Supabase's and is never read.
    onFailure?.({ message: `Supabase auth health answered ${res.status}`, code: String(res.status) });
    return "unreachable";
  } catch (err) {
    onFailure?.(err);
    return "unreachable";
  }
}

export interface HealthBody {
  ok: boolean;
  commit: string;
  checks: { app: "ok"; database: DatabaseCheck };
}

/**
 * 200 + ok:true when Supabase answered. 503 + ok:false when it did not.
 * `skipped` (no Supabase URL/key configured) is ok:true everywhere EXCEPT a
 * Vercel production deployment, where a missing configuration means every
 * signed-in screen is broken and the uptime check must fail.
 */
export function healthResponseBody(
  database: DatabaseCheck,
  env: Record<string, string | undefined>
): { status: 200 | 503; body: HealthBody } {
  const sha = env.VERCEL_GIT_COMMIT_SHA;
  const commit = sha && /^[0-9a-f]{7,40}$/i.test(sha) ? sha.slice(0, 7) : "local";
  const ok = database === "ok" || (database === "skipped" && env.VERCEL_ENV !== "production");
  return {
    status: ok ? 200 : 503,
    body: { ok, commit, checks: { app: "ok", database } },
  };
}
