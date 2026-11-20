"use client";

// The family join/approval flow (P0-2, migrations 023 + 026).
//
// Everything here goes through a SECURITY DEFINER RPC rather than a table
// write, because the tables are deliberately closed: `families` is readable
// by members only, and `parent_accounts` has no client INSERT policy at all.
// That is the whole point of P0-2 — before it, any signed-in stranger could
// insert themselves into any family and read a minor's data.
//
// None of these throw on an expected outcome. join_family in particular
// RETURNS a status (invalid / own_family / pending / approved) — see the
// long comment in 023 for why: it logs the attempt first, and a raise would
// roll that log back and defeat the rate limiter.

import { getSupabase } from "@/lib/supabase/client";
import { isEmailVerifyRequired, VERIFY_EMAIL_REQUIRED_MESSAGE } from "@/lib/email-verify-required";
import { familyFullMessage } from "@/lib/types";

export type JoinFamilyStatus =
  | "pending"
  | "approved"
  | "invalid"
  | "own_family"
  | "rate_limited"
  /** Migration 043: a PARENT account must prove its email (a link) before
   * it can ask to join. Players never get this. `message` carries the
   * sentence to show; lib/db/email-verification.ts sends the link. */
  | "verify_email_required"
  /** Migration 045: the family already holds the cap for this account's
   * role (4 players / 2 parents). Nothing was created; `message` says so. */
  | "family_full"
  | "error";

export interface JoinFamilyResult {
  status: JoinFamilyStatus;
  /** True when a row already existed for this user + code. */
  already?: boolean;
  /** Only set for "error"/"rate_limited"/"verify_email_required"/"family_full" — safe to show the user. */
  message?: string;
}

/** 045's answers: join_family() RETURNS {status:"family_full", role}; approve_family_join() RAISES "family_full_<role>". */
export function familyFullRole(value: unknown): "player" | "parent" | null {
  const text = typeof value === "string" ? value : "";
  if (text === "player" || text.includes("family_full_player")) return "player";
  if (text === "parent" || text.includes("family_full_parent")) return "parent";
  return null;
}

export interface PendingFamilyRequest {
  familyCode: string;
  /** First name only — that is all the database will disclose to someone
   * who is still pending. See the note at the top of migration 026. */
  approverFirstName: string;
  remindedAt: string | null;
  requestedAt: string;
}

export interface FamilyRosterMember {
  userId: string;
  name: string;
  email: string | null;
  role: "player" | "parent";
  status: "approved" | "pending";
  /** The family's account holder, as the database enforces it:
   * `user_id = family_account_holder(code)` (migrations 037 + 038).
   * NOT "belongs via their own profile" — in production's data shape four
   * people do, because the pre-023 app wrote both storage shapes. */
  isCreator: boolean;
  joinedAt: string;
  remindedAt: string | null;
  /** P0-8. 'pending' means this member is under 13 and no adult in the
   * family has recorded parental consent yet, so their account reads nothing
   * even once their family link is approved (migration 030). The approval
   * card uses this to say what approving actually does. */
  consentStatus: "not_required" | "pending" | "granted";
}

/** P0-8. The caller's own consent position, from my_consent_state(). */
export interface MyConsentState {
  status: "not_required" | "pending" | "granted" | "unknown";
  birthYearKnown: boolean;
}

const RATE_LIMITED = "53400";

function friendly(err: { code?: string; message?: string } | null): JoinFamilyResult {
  if (isEmailVerifyRequired(err)) {
    return { status: "verify_email_required", message: VERIFY_EMAIL_REQUIRED_MESSAGE };
  }
  if (err?.code === RATE_LIMITED) {
    return { status: "rate_limited", message: "Too many attempts. Try again in an hour." };
  }
  // Never surface a raw Postgres message to the user.
  return { status: "error", message: "Could not reach your family. Try again." };
}

export async function joinFamily(code: string): Promise<JoinFamilyResult> {
  const supabase = getSupabase();
  if (!supabase) return { status: "error", message: "Not configured." };

  const { data, error } = await supabase.rpc("join_family", {
    p_code: code.trim().toUpperCase(),
  });
  if (error) return friendly(error);

  const row = (data ?? {}) as { status?: string; already?: boolean; role?: string };
  if (row.status === "family_full") {
    return { status: "family_full", message: familyFullMessage(familyFullRole(row.role) ?? "player") };
  }
  return {
    status: (row.status as JoinFamilyStatus) ?? "error",
    already: row.already,
  };
}

export async function loadMyPendingFamilyRequest(
  signal?: AbortSignal
): Promise<PendingFamilyRequest | null> {
  const supabase = getSupabase();
  if (!supabase) return null;

  let q = supabase.rpc("my_pending_family_request");
  if (signal) q = q.abortSignal(signal);
  const { data, error } = await q;
  if (error || !data) return null;

  const row = data as {
    familyCode?: string;
    approverFirstName?: string;
    remindedAt?: string | null;
    requestedAt?: string;
  };
  if (!row.familyCode) return null;
  return {
    familyCode: row.familyCode,
    approverFirstName: row.approverFirstName ?? "your family",
    remindedAt: row.remindedAt ?? null,
    requestedAt: row.requestedAt ?? new Date().toISOString(),
  };
}

export async function loadFamilyRoster(signal?: AbortSignal): Promise<FamilyRosterMember[]> {
  const supabase = getSupabase();
  if (!supabase) return [];

  let q = supabase.rpc("family_members");
  if (signal) q = q.abortSignal(signal);
  const { data, error } = await q;
  if (error || !data) return [];

  return data.map((r) => ({
    userId: r.user_id,
    name: r.name,
    email: r.email,
    role: r.role === "parent" ? "parent" : "player",
    status: r.status === "pending" ? "pending" : "approved",
    isCreator: Boolean(r.is_creator),
    joinedAt: r.joined_at,
    remindedAt: r.reminded_at,
    consentStatus: narrowConsent(r.consent_status),
  }));
}

function narrowConsent(value: unknown): "not_required" | "pending" | "granted" {
  // Anything unrecognised reads as 'pending', which is the safe direction:
  // the UI then asks an adult rather than quietly treating a child's account
  // as cleared.
  return value === "granted" || value === "not_required" ? value : "pending";
}

/**
 * P0-8. Whether the signed-in account is waiting on a parent's consent.
 *
 * Needed as its own call because a pending account can read nothing — not
 * even the roster — so there is no other way for the app to find out why its
 * screens are empty. my_consent_state() is SECURITY DEFINER and tells the
 * caller about themselves only.
 */
export async function loadMyConsentState(signal?: AbortSignal): Promise<MyConsentState> {
  const supabase = getSupabase();
  if (!supabase) return { status: "unknown", birthYearKnown: false };

  let q = supabase.rpc("my_consent_state");
  if (signal) q = q.abortSignal(signal);
  const { data, error } = await q;
  if (error || !data || typeof data !== "object") {
    return { status: "unknown", birthYearKnown: false };
  }
  const payload = data as { status?: unknown; birth_year_known?: unknown };
  const status = payload.status;
  return {
    status:
      status === "pending" || status === "granted" || status === "not_required"
        ? status
        : "unknown",
    birthYearKnown: payload.birth_year_known === true,
  };
}

/**
 * P0-8. Records parental consent for an under-13 member whose family link is
 * already approved — the case approve_family_join() cannot cover because the
 * approval already happened (or was done by another player, who cannot
 * consent). Returns null on success, else a message safe to show.
 */
export async function grantParentConsent(userId: string): Promise<string | null> {
  const supabase = getSupabase();
  if (!supabase) return "Not configured.";
  const { data, error } = await supabase.rpc("grant_parent_consent", { p_user_id: userId });
  if (isEmailVerifyRequired(error)) return VERIFY_EMAIL_REQUIRED_MESSAGE;
  if (error) return "Could not record that. Try again.";
  const payload = (data ?? {}) as { status?: string; reason?: string };
  if (payload.status === "granted" || payload.status === "nothing_pending") return null;
  if (payload.reason === "not_a_parent_account") {
    return "Only a parent account can give consent for someone under 13.";
  }
  if (payload.reason === "own_account_pending") {
    return "Your own account is still waiting for a parent's approval.";
  }
  return "You can't give consent for that person.";
}

/** Any APPROVED member may approve. Returns null on success, else a message. */
export async function approveFamilyJoin(userId: string): Promise<string | null> {
  const supabase = getSupabase();
  if (!supabase) return "Not configured.";
  const { error } = await supabase.rpc("approve_family_join", { p_parent_user_id: userId });
  if (isEmailVerifyRequired(error)) return VERIFY_EMAIL_REQUIRED_MESSAGE;
  // 045: approving would take the family past 4 players / 2 parents.
  const fullRole = familyFullRole(error?.message);
  if (fullRole) return familyFullMessage(fullRole);
  return error ? "Could not approve that request. Try again." : null;
}

/** Deny removes the pending row outright — see migration 026 for why. */
export async function denyFamilyJoin(userId: string): Promise<string | null> {
  const supabase = getSupabase();
  if (!supabase) return "Not configured.";
  const { error } = await supabase.rpc("deny_family_join", { p_parent_user_id: userId });
  return error ? "Could not decline that request. Try again." : null;
}

export async function removeFamilyMember(userId: string): Promise<string | null> {
  const supabase = getSupabase();
  if (!supabase) return "Not configured.";
  const { error } = await supabase.rpc("remove_family_member", { p_user_id: userId });
  return error ? "Could not remove that person. Try again." : null;
}

export interface RemindResult {
  ok: boolean;
  message?: string;
}

/**
 * Bumps a timestamp so the request sorts to the top of the approver's card.
 * It sends NOTHING — Seeded has no email or push. Any copy around this must
 * say so; see migration 026.
 */
export async function remindFamilyApproval(): Promise<RemindResult> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, message: "Not configured." };
  const { error } = await supabase.rpc("remind_family_approval");
  if (!error) return { ok: true };
  if ((error as { code?: string }).code === RATE_LIMITED) {
    return { ok: false, message: "You just nudged them. Try again in an hour." };
  }
  return { ok: false, message: "Could not do that right now. Try again." };
}

/** Clears the caller's pending request so they can enter a different code. */
export async function cancelMyFamilyRequest(): Promise<string | null> {
  const supabase = getSupabase();
  if (!supabase) return "Not configured.";
  const { error } = await supabase.rpc("cancel_my_family_request");
  return error ? "Could not cancel that. Try again." : null;
}

/**
 * The family this user belongs to — their own `profiles.family_code` if they
 * created it, otherwise the code from their APPROVED parent link.
 *
 * A joiner's profile deliberately carries no family_code (that write is what
 * P0-2 closed), so anything that needs "which family am I in" must ask the
 * database rather than read the profile.
 */
export async function loadMyFamilyCode(signal?: AbortSignal): Promise<string | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  let q = supabase.rpc("my_family_code");
  if (signal) q = q.abortSignal(signal);
  const { data, error } = await q;
  if (error) return null;
  return (data as string | null) ?? null;
}

export type LeaveFamilyResult =
  | { ok: true }
  | { ok: false; reason: "account_holder" | "not_in_family" | "error"; message: string };

/** Shown when leave_family() refuses the family's account holder. */
export const ACCOUNT_HOLDER_CANNOT_LEAVE_MESSAGE =
  "You're this family's account holder, so you can't leave it. Everyone else joined through you.";

/** Maps leave_family()'s answer. Exported for the unit test. */
export function leaveFamilyOutcome(error: { code?: string; message?: string } | null): LeaveFamilyResult {
  if (!error) return { ok: true };
  const text = error.message ?? "";
  if (text.includes("account_holder_cannot_leave")) {
    return { ok: false, reason: "account_holder", message: ACCOUNT_HOLDER_CANNOT_LEAVE_MESSAGE };
  }
  if (text.includes("not_in_a_family")) {
    return { ok: false, reason: "not_in_family", message: "You're not in a family right now." };
  }
  if (error.code === RATE_LIMITED) {
    return { ok: false, reason: "error", message: "Too many changes at once. Try again later." };
  }
  // Never surface a raw Postgres message to the user.
  return { ok: false, reason: "error", message: "Could not leave the family. Try again." };
}

/**
 * Leaves the caller's own family (migration 046, leave_family()). Takes no
 * argument, so it can only ever act on the signed-in account — removing
 * someone ELSE is remove_family_member(), which refuses the caller. The
 * account holder is refused; under-13 consent resets to pending when the
 * caller has no family left; a Family plan the caller pays for stops
 * covering this family (045). See the migration's header.
 */
export async function leaveFamily(): Promise<LeaveFamilyResult> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, reason: "error", message: "Not configured." };
  const { error } = await supabase.rpc("leave_family");
  return leaveFamilyOutcome(error);
}
