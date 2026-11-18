// The B6 screens' rules, as plain functions (migration 043).
//
// Three surfaces ask someone to confirm their email:
//   1. joining a family as a PARENT (join_family refuses an unverified
//      parent with 42501 verify_email_required — the sign-up itself still
//      succeeds, so the join step must never look like a failed sign-up);
//   2. approving a join request / giving under-13 consent as a parent
//      (approve_family_join, grant_parent_consent — same refusal);
//   3. a dismissible banner for ANY signed-in account that hasn't confirmed,
//      players included, because a password reset goes to that address.
// Players are never blocked by any of it. The database decides who is
// verified; these only decide what to show, and what to remember across the
// hop out to the email and back.
//
// Everything stored here is in localStorage, wrapped in try/catch, and
// optional: the link works without it (it then lands on the default page and
// the person types nothing new but the code, which the join form also
// remembers). localStorage, not sessionStorage, because the link usually
// opens in a NEW tab, and PKCE already requires the same browser.

import { safeRedirectPath } from "@/lib/config/auth";
import type { JoinFamilyResult } from "@/lib/db/family-join";
import { VERIFY_EMAIL_REQUIRED_MESSAGE } from "@/lib/email-verify-required";

export const VERIFY_RETURN_KEY = "seeded.verify.return";
export const PENDING_JOIN_KEY = "seeded.verify.joinCode";
export const BANNER_DISMISSED_KEY = "seeded.verify.bannerDismissed";

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
  bannerText: "Confirm your email so you can reset your password later.",
  stillUnverified:
    "We can’t see the confirmation yet. Open the link in this browser, then try again.",
  /** sendVerificationLink() when the 3-an-hour limit (043) is spent. */
  linkLimit: "You’ve asked for 3 links in the last hour. Use the newest one in your inbox, or try again in an hour.",
} as const;

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

/** The family code a parent was refused with, so nothing is re-typed. */
export function rememberPendingJoinCode(code: string): void {
  const c = code.trim().toUpperCase();
  if (c) write(PENDING_JOIN_KEY, c);
}

export function readPendingJoinCode(): string | null {
  const c = (read(PENDING_JOIN_KEY) ?? "").trim().toUpperCase();
  // Family codes are short [A-Z0-9-]; anything else was not written by us.
  return /^[A-Z0-9-]{4,40}$/.test(c) ? c : null;
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
export const VERIFY_BANNER_HIDDEN_PREFIXES = [
  "/auth",
  "/login",
  "/signup",
  "/parent-login",
  "/parent-signup",
  "/reset-password",
  "/onboarding",
] as const;

export function isVerifyBannerHiddenOn(pathname: string): boolean {
  return VERIFY_BANNER_HIDDEN_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * Whether to show "Confirm your email so you can reset your password later."
 * Only a signed-in account whose `emailVerified` is KNOWN to be false (an
 * unknown value never nags), not on auth/onboarding pages, not once
 * dismissed. Players included; it never blocks anything.
 */
export function shouldShowVerifyBanner(input: {
  hydrated: boolean;
  isAuthed: boolean;
  emailVerified: boolean | undefined;
  pathname: string;
  dismissed: boolean;
}): boolean {
  if (!input.hydrated || !input.isAuthed) return false;
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
    default:
      return { kind: "error", message: result.message ?? "Could not do that right now." };
  }
}
