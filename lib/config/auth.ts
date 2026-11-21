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
  if (/[\u0000-\u001f\u007f]/.test(value)) return null;
  return value;
}

/** Pages a post-sign-in `?next=` must never point at: /login's own "already
 * signed in" effect would bounce to it again, for ever. */
const AUTH_PAGE = /^\/(?:login|signup|parent-signup|reset-password|auth)(?:[/?#]|$)/;

/**
 * safeRedirectPath, minus the auth pages. What /login honours after a
 * successful sign-in (QA sweep M3).
 */
export function safeLoginNext(next: string | null | undefined): string | null {
  const safe = safeRedirectPath(next);
  if (!safe || AUTH_PAGE.test(safe)) return null;
  return safe;
}

/**
 * Where a signed-out visitor on a signed-in-only page is sent: /login, with
 * the page they asked for as `?next=` so signing in lands them back there
 * (QA sweep M3: "Draft an email to the head coach" on every school page went
 * to a bare /login, and after signing in the visitor landed on Today).
 * Anything safeLoginNext would refuse — or "/" — gets a bare /login.
 */
export function loginHrefFor(pathAndSearch: string | null | undefined): string {
  const safe = safeLoginNext(pathAndSearch);
  return safe && safe !== "/" ? `/login?next=${encodeURIComponent(safe)}` : "/login";
}
