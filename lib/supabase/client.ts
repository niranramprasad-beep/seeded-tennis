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
      auth: { persistSession: true, autoRefreshToken: true },
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
export async function getAuthedUser(supa: SupabaseClient<Database>) {
  let result = await supa.auth.getUser();
  if (result.error && isStaleRefreshTokenError(result.error)) {
    await new Promise((resolve) => setTimeout(resolve, 400));
    result = await supa.auth.getUser();
  }
  return result;
}
