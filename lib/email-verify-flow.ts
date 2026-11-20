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
