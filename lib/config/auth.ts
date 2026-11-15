// Google sign-in: the feature flag and the redirect safety rules.
//
// The flag is NEXT_PUBLIC_, so it is readable in the browser and inlined at
// build time. That is correct here — it decides whether a button renders,
// not whether anything is allowed. The real gate is the Google provider
// being enabled in Supabase Auth: with the flag on and the provider off,
// the button would render and Supabase would refuse the request. Turning the
// flag on is therefore the LAST step of enabling Google sign-in, not the
// first.

/** True only for the literal string "true". Anything else — unset, "1",
 * "TRUE", "yes" — is off. A feature flag that guesses at its own value is
 * worse than one that is strict about it. */
export const GOOGLE_AUTH_ENABLED = process.env.NEXT_PUBLIC_GOOGLE_AUTH_ENABLED === "true";

/** Where Google sends the browser back to. One path, so the same value can be
 * registered in the Supabase dashboard's redirect allowlist and in the Google
 * console. */
export const OAUTH_CALLBACK_PATH = "/auth/callback";

/** Where a Google user lands when they have no Seeded profile yet. They are
 * authenticated but have given us no birth year, no role and no family — so
 * they are not finished signing up, and the rest of the app must not treat
 * them as if they were. */
export const OAUTH_COMPLETE_PATH = "/auth/complete";

/**
 * Makes a `?next=` value safe to redirect to.
 *
 * Only same-origin paths. Returns null for anything else, and the caller
 * falls back to its own default rather than redirecting somewhere unknown.
 *
 * The cases that matter, all of which a naive `startsWith("/")` lets through:
 *
 *   "//evil.com"        — protocol-relative; the browser reads it as a host
 *   "/\\evil.com"       — backslashes, which some browsers normalise to "/"
 *   "https://evil.com"  — absolute
 *   "javascript:..."    — not a navigation at all
 *
 * An open redirect on a login callback is worth more to an attacker than on
 * any other page: the victim arrives having just authenticated, from a link
 * that genuinely started on our domain.
 */
export function safeRedirectPath(next: string | null | undefined): string | null {
  if (!next) return null;
  const value = next.trim();
  if (!value.startsWith("/")) return null;
  // "//host" and "/\host" both leave the origin.
  if (value.startsWith("//") || value.startsWith("/\\")) return null;
  if (value.includes("\\")) return null;
  // Control characters can be used to smuggle a scheme past a prefix check.
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(value)) return null;
  return value;
}
