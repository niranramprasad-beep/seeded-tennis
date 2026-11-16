import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/database.types";

// Server-only client using the service role key — bypasses RLS. Used by the
// Stripe/Whop webhooks (no user session to act as) and by server-side write
// routes that need a request-scoped, RLS-respecting client — see
// lib/api-auth.ts's getRequestScopedSupabase for the latter.
let adminClient: SupabaseClient<Database> | null = null;

export function getSupabaseAdmin(): SupabaseClient<Database> | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  if (!adminClient) {
    adminClient = createClient<Database>(url, key, { auth: { persistSession: false } });
  }
  return adminClient;
}
