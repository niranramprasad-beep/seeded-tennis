// Validates the free-text "UTR profile link" field on Settings → Profile
// (components/seeded/settings/profile-card.tsx) and the pre-auth onboarding
// save step (components/seeded/onboarding/seeded-pre-auth-onboarding.tsx).
//
// A real UTR Sports player-profile page always lives at
// https://app.utrsports.net/profiles/{id} — the "app." subdomain, not the
// utrsports.net marketing site, and always under /profiles/. This only
// checks that SHAPE — it never fetches, scrapes, or otherwise makes a
// network request to the URL. The value is stored as a plain string and
// only ever rendered as an <a href> the player clicks themselves.
//
// Deliberately doesn't hardcode an ID format (numeric vs. slug) — UTR
// hasn't published a stable spec for it and vanity/slug ids are plausible,
// so this only requires *something* non-empty after /profiles/.

const UTR_PROFILE_HOST = "app.utrsports.net";

// Matches "scheme://" generically (not just http/https) so a non-browser
// scheme like "ftp://" or "mailto:" is parsed as its own protocol — and
// then rejected below with a clear "must be http/https" reason — rather
// than silently getting an extra "https://" glued on front of it.
const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i;

export interface UtrProfileLinkValidation {
  valid: boolean;
  /** Human-readable reason when invalid; null when valid. */
  error: string | null;
  /**
   * Absolute, scheme-qualified URL safe to store/use as an <a href>.
   * "" for an empty (optional, left-blank) input. null when invalid.
   */
  normalized: string | null;
}

/** Players very naturally paste "app.utrsports.net/profiles/123" with no
 * scheme at all — still an unambiguous, well-formed link, so add
 * "https://" rather than rejecting it outright. */
function withScheme(raw: string): string {
  return HAS_SCHEME.test(raw) ? raw : `https://${raw}`;
}

export function validateUtrProfileLink(raw: string): UtrProfileLinkValidation {
  const trimmed = raw.trim();
  if (!trimmed) return { valid: true, error: null, normalized: "" };

  let parsed: URL;
  try {
    parsed = new URL(withScheme(trimmed));
  } catch {
    return { valid: false, error: "Enter a valid URL.", normalized: null };
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return { valid: false, error: "Link must start with http:// or https://.", normalized: null };
  }

  if (parsed.hostname.toLowerCase() !== UTR_PROFILE_HOST) {
    return {
      valid: false,
      error: `Link must be a UTR Sports profile, e.g. ${UTR_PROFILE_HOST}/profiles/123456.`,
      normalized: null,
    };
  }

  if (!/^\/profiles\/[^/]+/i.test(parsed.pathname)) {
    return {
      valid: false,
      error: `Enter your profile link, e.g. ${UTR_PROFILE_HOST}/profiles/123456.`,
      normalized: null,
    };
  }

  return { valid: true, error: null, normalized: parsed.toString() };
}

/**
 * Best-effort absolute href for rendering an already-stored link that may
 * predate this validator (seeded/dev fixture data, or a row written before
 * this check existed) — never blocks rendering, just keeps the browser from
 * treating a bare "app.utrsports.net/..." value as relative to the current
 * page.
 */
export function utrProfileLinkHref(value: string): string {
  return withScheme(value.trim());
}
