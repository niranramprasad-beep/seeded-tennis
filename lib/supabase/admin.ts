import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Server-only client using the service role key — bypasses RLS. Only ever
// used by the Stripe webhook, which has no user session to act as.
let adminClient: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  if (!adminClient) {
    adminClient = createClient(url, key, { auth: { persistSession: false } });
  }
  return adminClient;
}
