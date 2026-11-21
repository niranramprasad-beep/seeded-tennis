import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/database.types";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// True once you've added the public Supabase env vars. Until then selected
// flows keep a local fallback so the UI remains demoable without secrets.
export const isSupabaseConfigured = Boolean(url && publishableKey);

// Typed with the real (hand-written, see lib/db/database.types.ts) schema —
// every `.from("table")` call site now gets real column types/autocomplete
// instead of falling back to `any`.
export type TypedSupabaseClient = SupabaseClient<Database>;

let browserClient: TypedSupabaseClient | null = null;

export function getSupabase(): TypedSupabaseClient | null {
  if (!isSupabaseConfigured) return null;
  if (!browserClient) {
    browserClient = createClient<Database>(url as string, publishableKey as string, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        // PKCE, explicitly. The OAuth callback (app/auth/callback) exchanges
        // the `?code=` itself rather than relying on whichever flow the
        // library defaults to this major version — an auth flow that changes
        // shape under a patch bump is not one to leave implicit.
        flowType: "pkce",
        detectSessionInUrl: true,
      },
    });
    // Any change of identity drops the verified-user memo below at once,
    // rather than waiting for its TTL. (A token refresh changes the access
    // token, which is the memo's key, so that case needs nothing here.)
    browserClient.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT" || event === "SIGNED_IN" || event === "USER_UPDATED") {
        verifiedUser = null;
      }
    });
  }
  return browserClient;
}

// Multiple tabs of the same origin share one localStorage session. When the
// access token needs refreshing, supabase-js rotates the refresh token —
// the first tab to refresh wins and writes the new one; any other tab
// mid-refresh at the same moment gets this exact error for the
// now-consumed token. Confirmed live by opening several tabs at once:
// AuthApiError "Invalid Refresh Token: Refresh Token Not Found". It's
// usually transient — supabase-js listens for the native `storage` event
// and picks up a sibling tab's fresh token automatically — so callers
// should retry once after a short delay rather than treating an otherwise-
// valid session as unusable.
function isStaleRefreshTokenError(error: { message?: string } | null): boolean {
  if (!error?.message) return false;
  const m = error.message.toLowerCase();
  return m.includes("refresh token") && (m.includes("not found") || m.includes("invalid"));
}

// Every call site that needs "the current user id" should go through this
// instead of calling supa.auth.getUser() directly — centralizes the
// cross-tab-race retry so the fix lives in one place, not duplicated (and
// easy to miss) across every file that loads user-scoped data.
async function fetchVerifiedUser(supa: SupabaseClient<Database>) {
  let result = await supa.auth.getUser();
  if (result.error && isStaleRefreshTokenError(result.error)) {
    await new Promise((resolve) => setTimeout(resolve, 400));
    result = await supa.auth.getUser();
  }
  return result;
}

type UserResult = Awaited<ReturnType<typeof fetchVerifiedUser>>;

/**
 * ONE server check of the session per access token, shared by every caller.
 *
 * WHY (D8, docs/archive/audit-2-perf.md): `auth.getUser()` is a network round
 * trip to Supabase Auth, and supabase-js runs it while holding its auth lock
 * — the same lock every REST query takes to read the access token. Each
 * data loader called this on its own, so a signed-in /today load made TEN
 * /auth/v1/user calls in strict series, and every table query queued behind
 * them. Measured at 100 ms of latency that chain alone was over a second of
 * blank skeleton.
 *
 * WHAT IS UNCHANGED: the first caller still gets a real server-validated
 * user for the current token, exactly as before; callers now share that
 * answer (in flight or resolved) instead of each asking again. Failures are
 * never memoised. Keyed on the access token, so a refresh or a different
 * user re-checks; cleared on sign-in/out/user-update (see getSupabase).
 * The TTL bounds how stale "this session was revoked server-side" can be in
 * the client to one minute — the access token itself stays valid for an
 * hour regardless, and RLS, not this, is the access control.
 */
const VERIFIED_USER_TTL_MS = 60_000;
let verifiedUser: {
  client: SupabaseClient<Database>;
  token: string;
  at: number;
  promise: Promise<UserResult>;
} | null = null;

// Every call site that needs "the current user id" should go through this
// instead of calling supa.auth.getUser() directly — centralizes the
// cross-tab-race retry so the fix lives in one place, not duplicated (and
// easy to miss) across every file that loads user-scoped data.
export async function getAuthedUser(supa: SupabaseClient<Database>): Promise<UserResult> {
  // Local read (no network unless the token needs refreshing, which getUser
  // would have done first anyway).
  const { data: sessionData } = await supa.auth.getSession();
  const token = sessionData.session?.access_token ?? null;
  // No session: getUser answers "no session" locally — nothing to share.
  if (!token) return fetchVerifiedUser(supa);

  const now = Date.now();
  const hit = verifiedUser;
  if (hit && hit.client === supa && hit.token === token && now - hit.at < VERIFIED_USER_TTL_MS) {
    return hit.promise;
  }
  const entry = { client: supa, token, at: now, promise: fetchVerifiedUser(supa) };
  verifiedUser = entry;
  const forget = () => {
    if (verifiedUser === entry) verifiedUser = null;
  };
  entry.promise.then((r) => {
    if (r.error || !r.data.user) forget();
  }, forget);
  return entry.promise;
}

/** Test seam: drop the memo. */
export function __resetVerifiedUserForTests() {
  verifiedUser = null;
}
