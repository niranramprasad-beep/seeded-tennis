// The OAuth callback reports a failure by redirecting to /login with a CODE,
// and /login turns the code into a sentence written here.
//
// It used to put the sentence itself in the URL (`/login?authError=<text>`)
// and /login rendered whatever arrived. That made the sign-in page print any
// text anyone put in a link — "Your account is locked, call this number" —
// inside the real error banner, on the real domain. Now an unknown value
// renders a fixed generic sentence and never the value.

export const OAUTH_ERROR_MESSAGES = {
  cancelled: "Google sign-in was cancelled.",
  google_failed: "Google sign-in didn't work. Try again, or use your email and password.",
  unavailable: "Sign-in isn't available right now. Try again shortly.",
  link_expired: "That sign-in link has expired. Try signing in again.",
  incomplete: "Google sign-in didn't complete. Try again, or use your email and password.",
  // The browser came back without the one-time key it stored when the
  // sign-in started: it began in another browser, or on another web address
  // of Seeded (the key is kept per address). Seen in production 2026-11-21:
  // a sign-in started on the deployment's vercel.app address came back to
  // seededtennis.com, and the person was left on the home page, signed out,
  // with no message at all.
  different_browser:
    "That Google sign-in started on a different web address or in another browser. Start it again from this page.",
  // Supabase's own refusals, by error_code (oauthProviderErrorCode below).
  google_unavailable: "Google sign-in isn't available right now. Use your email and password instead.",
  signups_closed: "New accounts are paused right now. Try again later.",
  account_exists:
    "There's already a Seeded account with that email. Sign in with your email and password.",
  server_error: "Something went wrong on our side. Try again in a moment.",
  unknown: "Something went wrong signing you in. Try again, or use your email and password.",
} as const;

export type OAuthErrorCode = keyof typeof OAUTH_ERROR_MESSAGES;

/** The sentence for a `?authError=` value, or null when there is none.
 * Anything that is not one of our codes gets the generic line. */
export function oauthErrorMessage(code: string | null | undefined): string | null {
  if (!code) return null;
  return Object.prototype.hasOwnProperty.call(OAUTH_ERROR_MESSAGES, code)
    ? OAUTH_ERROR_MESSAGES[code as OAuthErrorCode]
    : OAUTH_ERROR_MESSAGES.unknown;
}

/**
 * What a callback URL's own error parameters mean, or null when it carries
 * none. Supabase Auth redirects back with `error`, `error_code` and
 * `error_description` when Google refuses OR when Supabase itself does
 * (creating the user failed, sign-ups are off, the OAuth state was missing).
 * All of those used to become "Google sign-in didn't work", which sent people
 * back to Google for a problem Google did not have.
 *
 * Matches the stable `error_code` first and the prose second (older Auth
 * versions send only prose). Only ever returns one of our codes — the
 * provider's text is never shown.
 */
export function oauthProviderErrorCode(params: {
  get(name: string): string | null;
}): OAuthErrorCode | null {
  const error = params.get("error");
  const errorCode = params.get("error_code");
  const description = params.get("error_description");
  if (!error && !errorCode && !description) return null;

  const code = (errorCode ?? "").toLowerCase();
  const text = `${error ?? ""} ${description ?? ""}`.toLowerCase();

  if (error === "access_denied" && !code) return "cancelled";
  if (code === "signup_disabled" || text.includes("signups not allowed")) return "signups_closed";
  if (
    code === "provider_disabled" ||
    text.includes("provider is not enabled") ||
    text.includes("unsupported provider")
  ) {
    return "google_unavailable";
  }
  if (
    code === "identity_already_exists" ||
    code === "email_exists" ||
    code === "user_already_exists" ||
    text.includes("already linked") ||
    text.includes("already registered")
  ) {
    return "account_exists";
  }
  if (
    code === "bad_oauth_state" ||
    code === "bad_oauth_callback" ||
    code === "flow_state_not_found" ||
    code === "flow_state_expired" ||
    text.includes("state parameter") ||
    text.includes("oauth state")
  ) {
    return "link_expired";
  }
  if (
    code === "unexpected_failure" ||
    text.includes("database error") ||
    text.includes("unexpected failure") ||
    error === "server_error"
  ) {
    return "server_error";
  }
  if (error === "access_denied") return "cancelled";
  return "google_failed";
}

/**
 * Why `exchangeCodeForSession` failed, when no session exists afterwards.
 * The missing-verifier case is the one that matters: retrying the same link
 * can never work, starting again on this address does.
 */
export function oauthExchangeErrorCode(
  error: { code?: unknown; name?: unknown; message?: unknown } | null | undefined
): OAuthErrorCode {
  const code = typeof error?.code === "string" ? error.code : "";
  const name = typeof error?.name === "string" ? error.name : "";
  const message = typeof error?.message === "string" ? error.message.toLowerCase() : "";
  if (
    code === "pkce_code_verifier_not_found" ||
    name === "AuthPKCECodeVerifierMissingError" ||
    message.includes("code verifier")
  ) {
    return "different_browser";
  }
  return "link_expired";
}
