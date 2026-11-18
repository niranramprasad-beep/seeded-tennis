import { getSupabase } from "@/lib/supabase/client";
import { AUTH_ERROR_MESSAGES, friendlyAuthError } from "@/lib/auth";

// Parent email verification (B6, migration 043).
//
// WHY A LINK, AND NOT email_confirmed_at. "Confirm email" is OFF in
// production Auth, so Supabase stamps auth.users.email_confirmed_at at
// sign-up for everyone. It proves nothing about owning the address. The
// proof is a session that came from a link (or code) sent TO the address:
// its JWT carries amr method `magiclink` / `otp`. mark_email_verified()
// checks exactly that, server-side, and is the only writer of the
// privileged profiles.email_verified_at.
//
// The flow:
//   1. sendVerificationLink(email) — spends one of 3/hour from the
//      `email_verify` bucket (the limit lives in SQL, 043), then asks
//      Supabase to email a sign-in link to the account's own address.
//      shouldCreateUser: false, so it can never mint an account.
//   2. The person opens it. /auth/verified lands the new session (PKCE: it
//      must be opened in the SAME browser that asked) and calls
//      markEmailVerified().
//   3. join_family / approve_family_join / grant_parent_consent stop
//      refusing that parent with 42501 'verify_email_required'.
//
// Players are never asked.

/** Where the link sends the browser. Must be in Supabase Auth's redirect
 * allow-list (Dashboard -> Authentication -> URL Configuration). */
export const EMAIL_VERIFIED_PATH = "/auth/verified";

// The refusal's constants and detector live in a leaf module (import-cycle
// safety, see that file); re-exported here as part of this module's contract.
export {
  VERIFY_EMAIL_REQUIRED,
  VERIFY_EMAIL_REQUIRED_MESSAGE,
  isEmailVerifyRequired,
} from "@/lib/email-verify-required";

/**
 * Email a one-time sign-in link to `email` so the person can prove they own
 * it. Never throws. Errors come back as a sentence safe to show.
 */
export async function sendVerificationLink(email: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: AUTH_ERROR_MESSAGES.unknown };
  const address = email.trim();
  if (!address) return { ok: false, error: AUTH_ERROR_MESSAGES.invalidEmail };

  // The ceiling is in SQL (rate_limit_for_bucket, 043), so a caller cannot
  // raise its own. Fails closed: if the limiter cannot be asked, no email.
  try {
    const { data, error } = await supabase.rpc("consume_rate_limit", { p_bucket: "email_verify" });
    if (error) return { ok: false, error: friendlyAuthError(error) };
    const allowed = (data as { allowed?: unknown } | null)?.allowed === true;
    if (!allowed) return { ok: false, error: AUTH_ERROR_MESSAGES.rateLimited };
  } catch (e) {
    return { ok: false, error: friendlyAuthError(e) };
  }

  try {
    const { error } = await supabase.auth.signInWithOtp({
      email: address,
      options: {
        shouldCreateUser: false,
        emailRedirectTo:
          typeof window !== "undefined" ? `${window.location.origin}${EMAIL_VERIFIED_PATH}` : undefined,
      },
    });
    if (error) return { ok: false, error: friendlyAuthError(error) };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: friendlyAuthError(e) };
  }
}

/**
 * Record that the CURRENT session proves the address. True only when the
 * database agreed (the session came from a link/code, or the account is a
 * Google identity for that address). False otherwise, including on error.
 */
export async function markEmailVerified(): Promise<boolean> {
  const supabase = getSupabase();
  if (!supabase) return false;
  try {
    const { data, error } = await supabase.rpc("mark_email_verified");
    return !error && data === true;
  } catch {
    return false;
  }
}
