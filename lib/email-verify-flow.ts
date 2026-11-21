// The B6 screens' rules, as plain functions (migration 043).
//
// Three surfaces ask someone to confirm their email:
//   1. joining a family as a PARENT (join_family refuses an unverified
//      parent with 42501 verify_email_required — the sign-up itself still
//      succeeds, so the join step must never look like a failed sign-up);
//   2. approving a join request / giving under-13 consent as a parent
//      (approve_family_join, grant_parent_consent — same refusal);
//   3. a dismissible banner for a signed-in PARENT who hasn't confirmed —
//      they are the only accounts the database gates. Players never see it.
//      (It used to say a confirmed email was needed to reset a password;
//      that was untrue — Supabase sends a reset to the address regardless.)
// Players are never blocked by any of it. The database decides who is
// verified; these only decide what to show, and what to remember across the
// hop out to the email and back.
//
// Everything stored here is in localStorage, wrapped in try/catch, and
// optional: the link works without it (it then lands on the default page and
// the person types nothing new but the code, which the join form also
// remembers). localStorage, not sessionStorage, because the link usually
// opens in a NEW tab, and PKCE already requires the same browser.

import { familyFullMessage } from "@/lib/types";
import { safeRedirectPath } from "@/lib/config/auth";
import type { JoinFamilyResult } from "@/lib/db/family-join";
import { VERIFY_EMAIL_REQUIRED_MESSAGE } from "@/lib/email-verify-required";

const VERIFY_RETURN_KEY = "seeded.verify.return";
const PENDING_JOIN_KEY = "seeded.verify.joinCode";
const BANNER_DISMISSED_KEY = "seeded.verify.bannerDismissed";
/** Under SEEDED_STORAGE_PREFIX, so sign-out clears it (lib/local-storage-cleanup.ts). */
export const GOOGLE_VERIFY_KEY = "seeded.verify.google";

/** How long a "Verify with Google" start stays valid: long enough for a
 *  Google account picker and password, short enough that a stale marker
 *  never changes how a later emailed link is handled. */
export const GOOGLE_VERIFY_TTL_MS = 30 * 60 * 1000;

/** Where /auth/verified sends someone when nothing was remembered. */
export const DEFAULT_VERIFY_RETURN = "/today";

/** Copy, in one place. */
export const VERIFY_COPY = {
  send: "Send the link",
  sending: "Sending…",
  resend: "Send it again",
  retryJoin: "I’ve confirmed — try again",
  recheck: "I’ve confirmed",
  sent: (email: string) => `We sent a link to ${email}. Open it in this browser, then come back.`,
  joinTitle: (family: string) => `Confirm your email to join ${family}`,
  approveTitle: "Verify your email to approve",
  bannerText: "Confirm your email so you can approve family requests and give consent.",
  stillUnverified:
    "We can’t see the confirmation yet. Open the link in this browser, then try again.",
  /** sendVerificationLink() when the 3-an-hour limit (043) is spent. */
  linkLimit: "You’ve asked for 3 links in the last hour. Use the newest one in your inbox, or try again in an hour.",
  /** request_email_verification() refuses for 24 hours after an email change (043). */
  emailRecentlyChanged:
    "Your email address changed in the last day. For your security, try again tomorrow.",
  /** mark_email_verified() hit the profile_write limit (043). */
  markRateLimited: "Too many tries. Wait a few minutes and try again.",
  /** The second way to prove the address: a Google account for the SAME
   *  address (043's Google-identity half). Shown only when
   *  NEXT_PUBLIC_GOOGLE_AUTH_ENABLED is "true". */
  google: "Verify with Google instead",
  googleStarting: "Opening Google…",
  googleHint: "Works when your Google account uses the same email address as your Seeded account.",
  /** Google came back as a DIFFERENT account (its email is not this
   *  account's). The database refuses that, so the screen says why. */
  googleMismatch: (accountEmail: string | null, googleEmail: string | null, lostJoinCode = false) =>
    `${googleEmail ? `That Google account uses ${googleEmail}` : "That Google account uses a different email address"}${
      accountEmail ? `, but your Seeded account uses ${accountEmail}` : " from your Seeded account"
    }. Google can only confirm your email when the two addresses are the same, so nothing was confirmed. ` +
    // A Google address with no Seeded account gets a bare sign-in record
    // from Supabase (email, name and picture from Google). Say so.
    "If that Google address had no Seeded account, signing in may have created a sign-in for it; nothing else was saved. " +
    "We signed you out of Seeded on this browser (Google itself stays signed in). " +
    (lostJoinCode ? "You’ll need the family code again. " : "") +
    "Sign in again with your email and password, then use the emailed link or a Google account with the same address.",
  /** The local sign-out of the other account did not take. Never claim it did. */
  googleMismatchStillSignedIn:
    "That Google account uses a different email address from your Seeded account, so nothing was confirmed. " +
    "We couldn’t sign it out of Seeded on this browser yet. Try again; it only signs out this browser.",
  /** mark_email_verified() could not be reached (network / server error):
   *  never reported as "not confirmed". */
  markUnreachable: "We couldn’t reach Seeded to finish confirming your email. Check your connection and try again.",
  /** The person cancelled at Google, or Google refused. Nothing changed. */
  googleCancelled:
    "Google sign-in didn’t finish, so nothing changed. You can try again, or use the emailed link instead.",
  /** Same account came back, but the database did not accept Google as
   *  proof (e.g. Google itself has not verified that address). */
  googleNotProven:
    "Google didn’t confirm this account’s email address, so Seeded can’t accept it. Use the emailed link instead.",
} as const;

/**
 * The error a failed "Send the link" shows. Sending can fail for reasons
 * waiting does not fix (an email service that is not delivering, a
 * project-wide send limit), so when the Google option is on screen the
 * message points to it rather than only saying "try again".
 */
export function sendFailureMessage(error: string | null | undefined, googleAvailable: boolean): string {
  const base = (error ?? "").trim() || "We couldn’t send the link.";
  if (!googleAvailable) return base;
  const sep = /[.!?…]$/.test(base) ? " " : ". ";
  return `${base}${sep}You can also use “${VERIFY_COPY.google}” below, which sends no email.`;
}

function store(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

function read(key: string): string | null {
  try {
    return store()?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function write(key: string, value: string | null): void {
  try {
    const s = store();
    if (!s) return;
    if (value == null) s.removeItem(key);
    else s.setItem(key, value);
  } catch {
    /* private mode / blocked storage: the flow still works, it just forgets */
  }
}

/** A path /auth/verified may send someone back to. Same-origin only (the
 *  open-redirect rules in safeRedirectPath), and never an auth page — a
 *  return to /auth/verified itself would loop. */
export function safeVerifyReturn(path: string | null | undefined): string | null {
  const safe = safeRedirectPath(path);
  if (!safe) return null;
  const bare = safe.split(/[?#]/)[0];
  if (bare === "/auth" || bare.startsWith("/auth/")) return null;
  return safe;
}

/** Remember where to come back to. Call BEFORE sending the link. */
export function rememberVerifyReturn(path: string | null | undefined): void {
  const safe = safeVerifyReturn(path);
  if (safe) write(VERIFY_RETURN_KEY, safe);
}

/** Where to go after confirming; the default when nothing usable is stored. */
export function readVerifyReturn(): string {
  return safeVerifyReturn(read(VERIFY_RETURN_KEY)) ?? DEFAULT_VERIFY_RETURN;
}

export function clearVerifyReturn(): void {
  write(VERIFY_RETURN_KEY, null);
}

/** Family codes are short [A-Z0-9-]; anything else was not written by us. */
function normaliseJoinCode(code: unknown): string | null {
  const c = typeof code === "string" ? code.trim().toUpperCase() : "";
  return /^[A-Z0-9-]{4,40}$/.test(c) ? c : null;
}

/**
 * The family code a parent was refused with, so nothing is re-typed —
 * BOUND to the account that typed it. /auth/verified finishes the join
 * automatically, so a code left in a shared browser must never be submitted
 * for whoever signs in next. No owner, nothing stored.
 */
export function rememberPendingJoinCode(code: string, ownerId: string | null | undefined): void {
  const c = normaliseJoinCode(code);
  if (!c || !ownerId) return;
  write(PENDING_JOIN_KEY, JSON.stringify({ code: c, owner: ownerId }));
}

/** The remembered code, only for the account that stored it. A value
 *  stored for anyone else (or in the old, unbound shape) reads as nothing. */
export function readPendingJoinCode(ownerId: string | null | undefined): string | null {
  if (!ownerId) return null;
  const raw = read(PENDING_JOIN_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { code?: unknown; owner?: unknown } | null;
    if (!parsed || typeof parsed !== "object" || parsed.owner !== ownerId) return null;
    return normaliseJoinCode(parsed.code);
  } catch {
    return null;
  }
}

/** Whether the given account left a family code behind — a yes/no only, so
 *  /auth/verified can warn that a sign-out is about to drop it. Never
 *  returns the code. */
export function hasPendingJoinCodeFor(ownerId: string | null | undefined): boolean {
  return readPendingJoinCode(ownerId) !== null;
}

export function clearPendingJoinCode(): void {
  write(PENDING_JOIN_KEY, null);
}

export function isVerifyBannerDismissed(): boolean {
  return read(BANNER_DISMISSED_KEY) === "1";
}

export function dismissVerifyBanner(): void {
  write(BANNER_DISMISSED_KEY, "1");
}

/** Pages the banner never appears on: signing in or up, the auth landing
 *  pages, password reset, and onboarding. */
const VERIFY_BANNER_HIDDEN_PREFIXES = [
  "/auth",
  "/login",
  "/signup",
  "/parent-login",
  "/parent-signup",
  "/reset-password",
  "/onboarding",
] as const;

function isVerifyBannerHiddenOn(pathname: string): boolean {
  return VERIFY_BANNER_HIDDEN_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * Whether to show the confirm-your-email banner. Only a signed-in PARENT
 * (the one role 043 gates) whose `emailVerified` is KNOWN to be false (an
 * unknown value never nags), not on auth/onboarding pages, not once
 * dismissed. Players never see it; it never blocks anything.
 */
export function shouldShowVerifyBanner(input: {
  hydrated: boolean;
  isAuthed: boolean;
  role: string | null | undefined;
  emailVerified: boolean | undefined;
  pathname: string;
  dismissed: boolean;
}): boolean {
  if (!input.hydrated || !input.isAuthed) return false;
  if (input.role !== "parent") return false;
  if (input.emailVerified !== false) return false;
  if (input.dismissed) return false;
  return !isVerifyBannerHiddenOn(input.pathname);
}

/**
 * Whether an approve / consent button may be offered as-is, or must be
 * preceded by "Verify your email to approve". Only a PARENT is ever asked
 * (043 checks parents only); a player approving is never gated. For a parent
 * anything but a known `true` asks first — the database would refuse them
 * with 42501 otherwise, and asking before the click is the point.
 */
export function approvalNeedsVerification(viewer: {
  role: string | null | undefined;
  emailVerified?: boolean;
}): boolean {
  return viewer.role === "parent" && viewer.emailVerified !== true;
}

/**
 * What a family-code form does with join_family()'s answer. One mapping for
 * the sign-up step, the Google completion, /family's join form and the
 * "I've confirmed — try again" retry, so none of them can treat
 * verify_email_required as a failure: it is a step ("verify"), the account
 * is fine, and the code is kept.
 */
export type JoinOutcome =
  | { kind: "joined"; status: "pending" | "approved" }
  | { kind: "verify"; message: string }
  | { kind: "error"; message: string };

export function joinOutcomeFor(result: Pick<JoinFamilyResult, "status" | "message">): JoinOutcome {
  switch (result.status) {
    case "pending":
    case "approved":
      return { kind: "joined", status: result.status };
    case "verify_email_required":
      return { kind: "verify", message: VERIFY_EMAIL_REQUIRED_MESSAGE };
    case "invalid":
      return { kind: "error", message: "That code isn’t valid. Check it and try again." };
    case "own_family":
      return { kind: "error", message: "That’s already your own family." };
    case "rate_limited":
      return { kind: "error", message: "Too many tries. Wait an hour and try again." };
    case "family_full":
      // 045: the message names the cap and the support address.
      return { kind: "error", message: result.message ?? familyFullMessage("player") };
    default:
      return { kind: "error", message: result.message ?? "Could not do that right now." };
  }
}

// ---------------------------------------------------------------------------
// "Verify with Google instead" (043's Google-identity half)
// ---------------------------------------------------------------------------
//
// The parent is signed in (email + password). Starting Google OAuth while
// signed in does one of two things in Supabase:
//   - the Google account's verified email IS the account's email: Supabase
//     links the Google identity to the SAME user, and the session that comes
//     back is still that user. mark_email_verified() then finds a Google
//     identity whose verified email equals auth.users.email and stamps the
//     profile; email_is_verified() (what join/approve/consent call) reads
//     the same identity directly.
//   - a different address: Supabase signs the browser into a DIFFERENT user
//     (new, or one that already exists for that address). The database
//     would refuse that account anyway, so /auth/verified signs it out and
//     says why in plain English.
// We tell the two apart by remembering WHO started (user id + email) just
// before leaving for Google. Nothing here marks anyone verified — the
// database decides.

export type GoogleVerifyStart = { owner: string; email: string | null };

/** Remember who asked, just before leaving for Google. No owner, nothing stored. */
export function rememberGoogleVerifyStart(
  ownerId: string | null | undefined,
  email: string | null | undefined,
  now: number = Date.now()
): void {
  if (!ownerId) return;
  write(GOOGLE_VERIFY_KEY, JSON.stringify({ owner: ownerId, email: email ?? null, at: now }));
}

/** Read AND clear the marker. Null when absent, malformed, or outside the TTL. */
export function takeGoogleVerifyStart(now: number = Date.now()): GoogleVerifyStart | null {
  const raw = read(GOOGLE_VERIFY_KEY);
  write(GOOGLE_VERIFY_KEY, null);
  if (!raw) return null;
  try {
    const p = JSON.parse(raw) as { owner?: unknown; email?: unknown; at?: unknown } | null;
    if (!p || typeof p.owner !== "string" || !p.owner || typeof p.at !== "number") return null;
    if (now - p.at > GOOGLE_VERIFY_TTL_MS || p.at > now + 60_000) return null;
    return { owner: p.owner, email: typeof p.email === "string" ? p.email : null };
  } catch {
    return null;
  }
}

/**
 * What kind of error the return URL carries. Pure.
 *   "none"  -> no error, or a `code` is present (the exchange decides).
 *   "link"  -> an emailed link's error (Supabase: error_code otp_expired,
 *              "Email link is invalid or has expired"): show the link copy,
 *              even if a "Verify with Google" marker is lying around.
 *   "oauth" -> anything else: Google refused or the person cancelled.
 * Read from the query AND the fragment (`#error=`).
 */
export function returnErrorFrom(search: string, hash: string): "none" | "link" | "oauth" {
  const q = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const h = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash);
  if (q.get("code") || h.get("code")) return "none";
  const pick = (k: string) => q.get(k) ?? h.get(k) ?? "";
  if (!pick("error") && !pick("error_description")) return "none";
  const text = `${pick("error_code")} ${pick("error_description")}`.toLowerCase();
  return /otp|email link|magic ?link|signup|recovery/.test(text) ? "link" : "oauth";
}

/** Whether an access token was issued for an OAuth sign-in (its JWT `amr`
 *  has a method "oauth"). Decodes the payload only — it is never trusted for
 *  anything but choosing a screen; the database decides verification. */
export function sessionCameFromOAuth(accessToken: string | null | undefined): boolean {
  if (!accessToken) return false;
  const part = accessToken.split(".")[1];
  if (!part) return false;
  try {
    const b64 = part.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(part.length / 4) * 4, "=");
    const json =
      typeof atob === "function" ? atob(b64) : Buffer.from(b64, "base64").toString("binary");
    const payload = JSON.parse(json) as { amr?: unknown };
    if (!Array.isArray(payload.amr)) return false;
    return payload.amr.some(
      (e) => e === "oauth" || (typeof e === "object" && e !== null && (e as { method?: unknown }).method === "oauth")
    );
  } catch {
    return false;
  }
}

/** The session facts verifiedActionFor() needs, from a supabase-js session.
 *  `oauth` comes from the ACCESS TOKEN's amr (this sign-in), never from
 *  app_metadata.provider (the account's FIRST provider). Pure. */
export function verifiedSessionFrom(
  session: { access_token?: string | null; user?: { id?: string | null; email?: string | null } | null } | null | undefined
): { userId: string; email: string | null; oauth: boolean } | null {
  const userId = session?.user?.id;
  if (!session || !userId) return null;
  return {
    userId,
    email: session.user?.email ?? null,
    oauth: sessionCameFromOAuth(session.access_token),
  };
}

/** What /auth/verified does once it knows the session. */
export type VerifiedAction =
  /** Google refused or the person cancelled: the old session stands. */
  | { kind: "show"; screen: "google-cancelled" | "no-session" }
  /** Google came back as a DIFFERENT account: end this browser's session
   *  for it (scope "local" only), then show googleMismatch. */
  | { kind: "sign-out-local"; accountEmail: string | null; googleEmail: string | null }
  /** Ask the database (mark_email_verified). `via` picks the failure copy. */
  | { kind: "mark"; via: "google" | "link" };

/**
 * The post-exchange decision, pure. `started` is the "Verify with Google"
 * marker (already read and cleared). `session` is null when there is none.
 *
 *   an emailed link's error          -> show no-session (the link copy)
 *   marker + Google error            -> show google-cancelled
 *   Google error, no marker          -> show no-session
 *   no session                       -> show no-session
 *   no marker                        -> mark via link (the emailed link)
 *   marker, but the session is NOT an OAuth one (a stale marker on a shared
 *     device, then someone opens an emailed link) -> ignore it: mark via link
 *   marker, OAuth, another user      -> sign-out-local (never mark)
 *   marker, OAuth, same user         -> mark via google
 */
export function verifiedActionFor(input: {
  started: GoogleVerifyStart | null;
  returnError: "none" | "link" | "oauth";
  session: { userId: string; email: string | null; oauth: boolean } | null;
}): VerifiedAction {
  const { started, returnError, session } = input;
  // An emailed link's own error (expired / used) gets the link copy, even
  // with a leftover Google marker in this browser.
  if (returnError === "link") return { kind: "show", screen: "no-session" };
  if (returnError === "oauth") {
    return started ? { kind: "show", screen: "google-cancelled" } : { kind: "show", screen: "no-session" };
  }
  if (!session) return { kind: "show", screen: "no-session" };
  if (!started || !session.oauth) return { kind: "mark", via: "link" };
  if (session.userId !== started.owner) {
    return { kind: "sign-out-local", accountEmail: started.email, googleEmail: session.email };
  }
  return { kind: "mark", via: "google" };
}

export type VerifiedScreen =
  | "confirmed"
  | "not-proven"
  | "google-not-proven"
  | "rate-limited"
  | "unreachable";

/** mark_email_verified()'s answer -> the screen. A network/server failure is
 *  "unreachable", never "not confirmed". Pure. */
export function verifiedScreenFor(
  marked: "verified" | "not-proven" | "rate-limited" | "unreachable",
  via: "google" | "link"
): VerifiedScreen {
  if (marked === "verified") return "confirmed";
  if (marked === "rate-limited") return "rate-limited";
  if (marked === "unreachable") return "unreachable";
  return via === "google" ? "google-not-proven" : "not-proven";
}

/**
 * "Verify with Google instead", in order, with its effects injected so the
 * order is tested: run the caller's preparation, remember WHO asked (refuse
 * if nobody is signed in), then leave for Google — and if Google could not
 * be started, forget the start again so a stale marker can never shape a
 * later visit to /auth/verified. Returns an error sentence, or null when the
 * browser is on its way to Google.
 */
export async function startGoogleVerify(deps: {
  beforeStart?: () => void | Promise<void>;
  rememberStart: () => Promise<boolean>;
  signIn: () => Promise<{ ok: boolean; error?: string }>;
  clearStart: () => void;
}): Promise<string | null> {
  await deps.beforeStart?.();
  if (!(await deps.rememberStart())) return "Sign in first, then try again.";
  let result: { ok: boolean; error?: string };
  try {
    result = await deps.signIn();
  } catch {
    result = { ok: false };
  }
  if (result.ok) return null;
  deps.clearStart();
  return result.error ?? "Couldn’t start Google. Try again.";
}
