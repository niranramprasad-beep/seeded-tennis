import { getAuthedUser, getSupabase } from "@/lib/supabase/client";

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

/**
 * The signed-in account's own birth year, or null when it has none on file
 * (or the read fails). For the signed-in /onboarding diagnostic, which shows
 * it rather than asking again: `birth_year` is write-once from the client
 * (033), so a year picked there could never be saved anyway.
 *
 * A single-row read of the caller's OWN profile by `.eq("id", …)` — the only
 * shape lib/db/family-scope.test.ts allows on `profiles`.
 */
export async function loadMyBirthYear(): Promise<number | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  const { data: auth } = await getAuthedUser(supabase);
  const uid = auth.user?.id;
  if (!uid) return null;
  const { data, error } = await supabase.from("profiles").select("birth_year").eq("id", uid).maybeSingle();
  if (error || !data) return null;
  const year = (data as { birth_year: number | null }).birth_year;
  return typeof year === "number" ? year : null;
}

/** The signed-in account's own auth id, or null. Used to find "you" in the
 * family roster, which family_members() returns with everyone in it. */
export async function loadMyUserId(): Promise<string | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  const { data } = await getAuthedUser(supabase);
  return data.user?.id ?? null;
}
