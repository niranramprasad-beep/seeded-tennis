import { getSupabase } from "@/lib/supabase/client";

// How the signed-in account signs in — for the parent's Settings, which has
// to say "your password" or "your Google account" truthfully rather than
// offering a password reset to someone who never set a password.
//
// Read from the auth user, never from `profiles`: the profile's `email` is
// a copy written at signup, and the auth user is the one that receives the
// reset email.
export interface SignInInfo {
  email: string | null;
  /** "email" = email + password; "google" = Google OAuth only. */
  method: "email" | "google" | "unknown";
}

export async function loadMySignInInfo(): Promise<SignInInfo> {
  const supabase = getSupabase();
  if (!supabase) return { email: null, method: "unknown" };
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return { email: null, method: "unknown" };
  const providers = new Set(
    (data.user.identities ?? []).map((i) => i.provider).concat(
      typeof data.user.app_metadata?.provider === "string" ? [data.user.app_metadata.provider] : []
    )
  );
  const method: SignInInfo["method"] = providers.has("email")
    ? "email"
    : providers.has("google")
      ? "google"
      : "unknown";
  return { email: data.user.email ?? null, method };
}
