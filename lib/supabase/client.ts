import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// True once you've added the public Supabase env vars. Until then selected
// flows keep a local fallback so the UI remains demoable without secrets.
export const isSupabaseConfigured = Boolean(url && publishableKey);

let browserClient: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (!isSupabaseConfigured) return null;
  if (!browserClient) {
    browserClient = createClient(url as string, publishableKey as string, {
      auth: { persistSession: true, autoRefreshToken: true },
    });
  }
  return browserClient;
}
