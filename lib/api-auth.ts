import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/database.types";
import { narrowNullableLiteral } from "@/lib/db/narrow";

const PROFILE_ROLES = ["player", "parent"] as const;

// Shared by API routes that need to know which Supabase user is making the
// request — the client sends their session's access token as a Bearer
// header, and we validate it against Supabase Auth directly (no cookies/SSR
// helper needed, since every call here is a one-off fetch from a client
// component, not a page render).
export async function getAuthedUser(req: Request): Promise<User | null> {
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!token || !url || !key) return null;

  const supabase = createClient<Database>(url, key);
  const { data } = await supabase.auth.getUser(token);
  return data.user;
}

// Real write route handlers (item 3 of the lib/db reorg — see
// app/api/outreach, app/api/family/budget*, app/api/account/deletion) need
// a Supabase client that's actually scoped to the calling user so RLS
// decides what it can touch, not the admin/service-role client (which
// bypasses RLS entirely and would need every ownership check re-implemented
// by hand in the route). The browser's shared `getSupabase()` singleton
// (lib/supabase/client.ts) is NOT reusable here: it reads/writes a session
// from localStorage, which doesn't exist on the server, and — being a
// module-level singleton — would leak one request's session into a
// concurrent request on the same server process if it were.
//
// This builds a fresh, unshared client per request instead, forwarding the
// caller's bearer token as the `Authorization` header on every PostgREST
// call so `auth.uid()` resolves inside RLS exactly as it would for the
// same request made directly from the browser. Returns null (never throws)
// when the token is missing/invalid/unconfigured — callers should respond
// 401.
export async function getRequestScopedSupabase(
  req: Request
): Promise<{ user: User; supabase: SupabaseClient<Database> } | null> {
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!token || !url || !key) return null;

  const supabase = createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return null;
  return { user: data.user, supabase };
}

// Several write routes (app/api/family/budget*, app/api/outreach) need the
// caller's family_code to scope a family-shared write the exact same way
// the browser-direct lib/db functions already do (via userIdAndProfile()).
// Centralized here so each route handler doesn't repeat the same
// `.from("profiles").select(...)` lookup.
export async function getProfileRoleAndFamily(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<{ role: "player" | "parent" | null; familyCode: string | null }> {
  const { data } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();
  // NOT `profiles.family_code`. That column is NULL for everyone who joined
  // with a code (migrations 023/032 deliberately never write it), so reading
  // it here handed the budget routes a null family and they refused the
  // write — a parent who joined by code could not save the season budget or
  // an expense at all. `my_family_code()` (026) answers across both
  // membership shapes. See lib/db/family-scope.ts and migration 036.
  const { data: code } = await supabase.rpc("my_family_code");
  return {
    role: narrowNullableLiteral(data?.role ?? null, PROFILE_ROLES),
    familyCode: (code as string | null) ?? null,
  };
}

/**
 * Refuse a write to the caller's PLAYER data when the caller is a parent.
 *
 * Parents follow a player; they do not log results, ratings, plans or
 * outreach. The UI keeps them off those screens (AuthGate), but a route is
 * an API, and an API that accepts the write is a parent writing tennis data
 * onto their own row — which is how persona (f) came to hold a UTR entry of
 * 5.00 that /family/weekly-reports once subtracted from the child's.
 *
 * Reads `role` from the caller's own profile row. Returns a 403 response to
 * send, or null to continue. Used by every player-data write route;
 * `lib/parent-read-only.test.ts` fails the build if one of them stops
 * calling it.
 *
 * Not a substitute for RLS: a parent can never touch the PLAYER's rows on
 * any of these tables (each checks `user_id = auth.uid()`). This closes the
 * app's own path to writing tennis data under the parent's id.
 */
export async function refuseParentPlayerDataWrite(ctx: {
  user: User;
  supabase: SupabaseClient<Database>;
}): Promise<Response | null> {
  const { data } = await ctx.supabase
    .from("profiles")
    .select("role")
    .eq("id", ctx.user.id)
    .maybeSingle();
  if (data?.role !== "parent") return null;
  return new Response(
    JSON.stringify({
      error: "Parent accounts can't change a player's results, ratings, plan or outreach.",
    }),
    { status: 403, headers: { "content-type": "application/json" } }
  );
}
