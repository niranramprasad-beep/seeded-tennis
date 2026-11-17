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
