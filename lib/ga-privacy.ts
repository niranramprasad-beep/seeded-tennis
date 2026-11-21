// What Google Analytics may see, and when it may run at all. Pure — no
// React, no window — so lib/ga-privacy.test.ts can pin every rule, and
// components/shared/google-analytics.tsx is only the wiring.
//
// Audit A-201: the page_view used to send `${pathname}?${query}`. The
// homepage calculator keeps a player's UTR, GPA, grad year and gender in the
// query string, so those went to Google with every view. GA now receives a
// path and nothing after it — no query, no hash — in page_path,
// page_location and page_referrer alike.
//
// The rules, in the order shouldLoadGa() applies them:
//   1. Automation (navigator.webdriver) and browsers flagged internal
//      (localStorage "seeded.internal" = "1") are never tracked.
//   2. Nothing on /auth/* — the OAuth callback and sign-up completion pages,
//      whose URLs carry one-time codes.
//   3. A signed-in account that needed a parent's consent is never tracked:
//      consent_status 'pending' (waiting) or 'granted' (a parent said yes —
//      still a child under 030's `consent_required_for_birth_year`, mirrored
//      in lib/config/consent.ts). Only 'not_required' WITH a known birth
//      year is tracked: an account that never gave one (created before 030)
//      also reads 'not_required' from the database, and we cannot tell its
//      age, so it is treated as unknown.
//   4. Anything not yet known — the session still restoring, a connection
//      error, the consent check not answered or failed, the browser checks
//      not run yet — means WAIT. Unknown never fires first.

/** The localStorage flag that marks a browser as ours (Niran, testers). */
export const GA_INTERNAL_FLAG_KEY = "seeded.internal";
/** `?seeded_internal=1` sets the flag; `?seeded_internal=0` clears it. */
export const GA_INTERNAL_PARAM = "seeded_internal";

/** consent_status as my_consent_state() reports it; undefined = not answered. */
export type GaConsentStatus = "not_required" | "pending" | "granted" | "unknown" | undefined;

export type GaAccountState =
  /** Session not restored yet, or Supabase unreachable: we do not know who this is. */
  | { kind: "unknown" }
  | { kind: "signed-out" }
  | {
      kind: "signed-in";
      consentStatus: GaConsentStatus;
      /** my_consent_state().birth_year_known; undefined = not answered. */
      birthYearKnown?: boolean;
    };

export interface GaDecisionInput {
  pathname: string;
  account: GaAccountState;
  /** navigator.webdriver; undefined = not checked yet. */
  webdriver: boolean | undefined;
  /** localStorage "seeded.internal" === "1"; undefined = not checked yet. */
  internalFlag: boolean | undefined;
}

/** What the app knows about the session, as PlayerProvider and the
 * per-user consent fetch report it. */
export interface GaSessionFacts {
  hydrated: boolean;
  connectionError: string | null;
  isAuthed: boolean;
  userId: string | null;
  consent: { status: GaConsentStatus; birthYearKnown: boolean } | undefined;
  consentError: unknown;
}

/** The account state GA is decided on. Anything not yet known is unknown,
 * or a signed-in account with no consent answer — both a no. */
export function gaAccountState(f: GaSessionFacts): GaAccountState {
  if (!f.hydrated || f.connectionError) return { kind: "unknown" };
  if (!f.isAuthed) return { kind: "signed-out" };
  if (!f.userId) return { kind: "signed-in", consentStatus: undefined };
  if (f.consentError) return { kind: "signed-in", consentStatus: "unknown" };
  if (!f.consent) return { kind: "signed-in", consentStatus: undefined };
  return {
    kind: "signed-in",
    consentStatus: f.consent.status,
    birthYearKnown: f.consent.birthYearKnown,
  };
}

/** /auth and everything under it. Case-insensitive, trailing slash or not. */
export function isGaExcludedPath(pathname: string): boolean {
  const path = gaPagePath(pathname).toLowerCase();
  return path === "/auth" || path.startsWith("/auth/");
}

/** Whether this account may be counted. Only an explicit 'not_required'
 * passes for a signed-in account; every other answer, including none yet,
 * is a no. */
export function accountAllowsGa(account: GaAccountState): boolean {
  if (account.kind === "signed-out") return true;
  if (account.kind === "signed-in") {
    return account.consentStatus === "not_required" && account.birthYearKnown === true;
  }
  return false;
}

/** Rule 1 on its own: not automation, not an internal browser, and both
 * actually checked (undefined = not yet, which is a no). */
export function browserAllowsGa(input: Pick<GaDecisionInput, "webdriver" | "internalFlag">): boolean {
  return input.webdriver === false && input.internalFlag === false;
}

/** The single gate: whether gtag may be loaded AND whether an event may be
 * sent right now. Same rule for both, re-asked on every change. */
export function shouldLoadGa(input: GaDecisionInput): boolean {
  if (!browserAllowsGa(input)) return false;
  if (isGaExcludedPath(input.pathname)) return false;
  return accountAllowsGa(input.account);
}

/** The path GA is given: the pathname, cut at the first `?` or `#`. */
export function gaPagePath(pathname: string | null | undefined): string {
  const cut = (pathname ?? "").split(/[?#]/, 1)[0] ?? "";
  if (!cut) return "/";
  return cut.startsWith("/") ? cut : `/${cut}`;
}

/** page_location: our origin plus gaPagePath(), never document.location.href. */
export function gaPageLocation(origin: string, pathname: string): string {
  let base = "";
  try {
    base = new URL(origin).origin;
  } catch {
    base = "";
  }
  return `${base}${gaPagePath(pathname)}`;
}

/** page_referrer: origin + path of the referring page, query and hash
 * dropped. Undefined when there is none or it does not parse. */
export function gaReferrer(referrer: string | null | undefined): string | undefined {
  if (!referrer) return undefined;
  try {
    const url = new URL(referrer);
    if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;
    return `${url.origin}${gaPagePath(url.pathname)}`;
  } catch {
    return undefined;
  }
}

/** What `?seeded_internal=` asks for, if anything. */
export function internalParamAction(search: string): "set" | "clear" | null {
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(search);
  } catch {
    return null;
  }
  if (!params.has(GA_INTERNAL_PARAM)) return null;
  return params.get(GA_INTERNAL_PARAM) === "1" ? "set" : "clear";
}

/** The same URL (path + remaining query + hash) without seeded_internal, or
 * null when it was not there. For history.replaceState. */
export function stripInternalParam(href: string): string | null {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  if (!url.searchParams.has(GA_INTERNAL_PARAM)) return null;
  url.searchParams.delete(GA_INTERNAL_PARAM);
  const search = url.searchParams.toString();
  return `${url.pathname}${search ? `?${search}` : ""}${url.hash}`;
}

type FlagStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/** Applies `?seeded_internal=` (if present) to storage and returns whether
 * this browser is internal. Storage that throws reads as "not internal" —
 * a private window is a real visitor. */
export function syncInternalFlag(search: string, storage: FlagStorage | null): boolean {
  if (!storage) return false;
  const action = internalParamAction(search);
  try {
    if (action === "set") storage.setItem(GA_INTERNAL_FLAG_KEY, "1");
    else if (action === "clear") storage.removeItem(GA_INTERNAL_FLAG_KEY);
  } catch {
    // Could not write it. Honour the URL for this page at least.
    if (action === "set") return true;
  }
  try {
    return storage.getItem(GA_INTERNAL_FLAG_KEY) === "1";
  } catch {
    return action === "set";
  }
}

/** The gtag config every load starts with. send_page_view is off because
 * the component sends each page_view itself, with a stripped location;
 * page_location/page_referrer are set here so nothing gtag sends on its own
 * falls back to document.location (which carries the query). */
export function gaConfigParams(location: string, referrer: string | undefined) {
  return {
    send_page_view: false,
    page_location: location,
    ...(referrer ? { page_referrer: referrer } : {}),
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
  };
}

/** The page_view event's params. Path only, by construction. */
export function gaPageViewParams(origin: string, pathname: string, referrer: string | undefined) {
  const page_path = gaPagePath(pathname);
  return {
    page_path,
    page_location: gaPageLocation(origin, page_path),
    ...(referrer ? { page_referrer: referrer } : {}),
  };
}
