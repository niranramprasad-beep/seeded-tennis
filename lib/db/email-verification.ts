import { getAuthedUser, getSupabase } from "@/lib/supabase/client";
import { EMAIL_VERIFIED_PATH } from "@/lib/config/auth";
import { AUTH_ERROR_MESSAGES, friendlyAuthError, isEmailVerifiedFor } from "@/lib/auth";
import {
  VERIFY_COPY,
  readPendingJoinCode,
  rememberGoogleVerifyStart,
  rememberPendingJoinCode,
} from "@/lib/email-verify-flow";

// Parent email verification (B6, migration 043).
//
// WHY A LINK, AND NOT email_confirmed_at. "Confirm email" is OFF in
// production Auth, so Supabase stamps auth.users.email_confirmed_at at
// sign-up for everyone. It proves nothing about owning the address. The
// proof is a session that came from a link (or code) sent TO the address:
// its JWT carries amr method `magiclink` / `otp` with a timestamp.
// mark_email_verified() checks that server-side, and is the only writer of
// the privileged profiles.email_verified_at.
//
// The flow:
//   1. sendVerificationLink() — request_email_verification() (043) spends
//      one of 3/hour from the `email_verify` bucket and records WHICH
//      address the link is for (the account's current auth email) and WHEN.
//      Only then does Supabase email a sign-in link, to exactly the address
//      the database returned — never one the screen was handed.
//      shouldCreateUser: false, so it can never mint an account.
//   2. The person opens it. /auth/verified lands the new session (PKCE: it
//      must be opened in the SAME browser that asked) and calls
//      markEmailVerified(). The database accepts it only if that session was
//      authenticated by the link AFTER the request, within the last hour,
//      for the requested address, with no email change in the day before.
//   3. join_family / approve_family_join / grant_parent_consent stop
//      refusing that parent with 42501 'verify_email_required'.
//
// Players are never asked.
//
// What the `email_verify` bucket does NOT do: protect the project's email
// budget. signInWithOtp is a public Auth endpoint anyone can call with the
// anon key without ever touching Seeded's RPC. The limits on that are
// Supabase project settings (Auth -> Rate Limits, SMTP), not this repo.

/** Where the link sends the browser. Must be in Supabase Auth's redirect
 * allow-list (Dashboard -> Authentication -> URL Configuration). Defined in
 * lib/config/auth.ts so the Google sign-in helper can use it without an import
 * cycle. */
export { EMAIL_VERIFIED_PATH } from "@/lib/config/auth";

// The refusal's constants and detector live in a leaf module (import-cycle
// safety, see that file); re-exported here as part of this module's contract.
export {
  VERIFY_EMAIL_REQUIRED,
  VERIFY_EMAIL_REQUIRED_MESSAGE,
  isEmailVerifyRequired,
} from "@/lib/email-verify-required";

type RequestResult = { allowed: true; email: string } | { allowed: false; reason: string };

/** request_email_verification()'s jsonb, or null when it is not that shape. */
function parseVerificationRequest(data: unknown): RequestResult | null {
  if (!data || typeof data !== "object") return null;
  const d = data as { allowed?: unknown; email?: unknown; reason?: unknown };
  if (d.allowed === true && typeof d.email === "string" && d.email) return { allowed: true, email: d.email };
  if (d.allowed === false) return { allowed: false, reason: typeof d.reason === "string" ? d.reason : "unknown" };
  return null;
}

/**
 * Email a one-time sign-in link to the signed-in account's OWN address so
 * the person can prove they own it. The address comes from the database
 * (request_email_verification, 043), which also records the request that
 * mark_email_verified() later checks the session against — so the request
 * and the link are always for the same address. Never throws. Errors come
 * back as a sentence safe to show; `email` is where the link went.
 */
export async function sendVerificationLink(): Promise<{ ok: boolean; email?: string; error?: string }> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: AUTH_ERROR_MESSAGES.unknown };

  // Fails closed: if the request cannot be recorded, no email.
  let address: string;
  try {
    const { data, error } = await supabase.rpc("request_email_verification");
    if (error) return { ok: false, error: friendlyAuthError(error) };
    const request = parseVerificationRequest(data);
    if (!request) return { ok: false, error: AUTH_ERROR_MESSAGES.unknown };
    if (!request.allowed) {
      // Not AUTH_ERROR_MESSAGES.rateLimited ("wait a minute"): this bucket
      // is 3 an hour, so a minute's wait would just fail again.
      if (request.reason === "rate_limited") return { ok: false, error: VERIFY_COPY.linkLimit };
      if (request.reason === "email_recently_changed") {
        return { ok: false, error: VERIFY_COPY.emailRecentlyChanged };
      }
      return { ok: false, error: AUTH_ERROR_MESSAGES.unknown };
    }
    address = request.email;
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
    return { ok: true, email: address };
  } catch (e) {
    return { ok: false, error: friendlyAuthError(e) };
  }
}

/**
 * Re-reads whether the signed-in account has proven its email, for an
 * "I've confirmed" button in a tab that sent the link while the link itself
 * was opened in another. Same rule as the profile mapping
 * (isEmailVerifiedFor): the stamped address must be the CURRENT one. Reads
 * the caller's own profile row only. False on any error.
 */
export async function checkEmailVerified(): Promise<boolean> {
  const supabase = getSupabase();
  if (!supabase) return false;
  try {
    const { data } = await getAuthedUser(supabase);
    const user = data.user;
    if (!user) return false;
    const { data: profile, error } = await supabase
      .from("profiles")
      .select("email_verified_at, email_verified_for")
      .eq("id", user.id)
      .maybeSingle();
    if (error) return false;
    return isEmailVerifiedFor(profile, user);
  } catch {
    return false;
  }
}

/** The signed-in account's id, or null. Never throws. */
async function currentUserId(): Promise<string | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  try {
    const { data } = await getAuthedUser(supabase);
    return data.user?.id ?? null;
  } catch {
    return null;
  }
}

/** rememberPendingJoinCode() for the signed-in account (bound to its id, so
 *  /auth/verified never submits it for anyone else). */
export async function rememberMyPendingJoinCode(code: string): Promise<void> {
  rememberPendingJoinCode(code, await currentUserId());
}

/**
 * Before "Verify with Google instead" leaves for Google: remember which
 * account asked (id + current auth email), so /auth/verified can tell
 * whether Google came back as the SAME account (linked by its verified
 * email) or signed the browser into a different one. False when nobody is
 * signed in — the caller then does not start Google at all.
 */
export async function rememberMyGoogleVerifyStart(): Promise<boolean> {
  const supabase = getSupabase();
  if (!supabase) return false;
  try {
    const { data } = await getAuthedUser(supabase);
    const user = data.user;
    if (!user) return false;
    rememberGoogleVerifyStart(user.id, user.email ?? null);
    return true;
  } catch {
    return false;
  }
}

/** The code the signed-in account left behind, or null — including when a
 *  code is stored for a different account. */
export async function readMyPendingJoinCode(): Promise<string | null> {
  return readPendingJoinCode(await currentUserId());
}

export type MarkEmailVerifiedResult = "verified" | "not-proven" | "rate-limited" | "unreachable";

/** 043 raises this (errcode 53400) when its own profile write is refused by
 *  the profile_write limit. */
const EMAIL_VERIFY_RATE_LIMITED = "email_verify_rate_limited";

/**
 * Which kind of failure a mark_email_verified() error is. Pure, exported for
 * tests.
 *   rate-limited -> 53400 / email_verify_rate_limited (043's own write).
 *   not-proven   -> the DATABASE answered with an error (a SQLSTATE or a
 *                   PostgREST PGRST code): it is not going to say yes.
 *   unreachable  -> no answer at all (a thrown fetch, an error with no code,
 *                   an HTTP-ish failure): a blip, never "not confirmed".
 */
export function markErrorKind(error: unknown): Exclude<MarkEmailVerifiedResult, "verified"> {
  const e = (error ?? {}) as { code?: unknown; message?: unknown };
  const code = typeof e.code === "string" ? e.code : "";
  const message = typeof e.message === "string" ? e.message : "";
  if (code === "53400" || message.includes(EMAIL_VERIFY_RATE_LIMITED)) return "rate-limited";
  if (/^[0-9A-Z]{5}$/.test(code) || /^PGRST\d+$/.test(code)) return "not-proven";
  return "unreachable";
}

/**
 * Record that the CURRENT session proves the address. "verified" only when
 * the database agreed (a link/code session newer than the request, for the
 * requested address — or a Google identity for that address).
 * "rate-limited" when the write was refused by the profile_write limit, so
 * the screen says "too many tries" rather than "not proven". "unreachable"
 * when the database never answered (network / server error). "not-proven"
 * when it answered no.
 */
export async function markEmailVerified(): Promise<MarkEmailVerifiedResult> {
  const supabase = getSupabase();
  if (!supabase) return "unreachable";
  try {
    const { data, error } = await supabase.rpc("mark_email_verified");
    if (error) return markErrorKind(error);
    return data === true ? "verified" : "not-proven";
  } catch (e) {
    return markErrorKind(e);
  }
}
