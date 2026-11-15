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

export type JoinFamilyStatus =
  | "pending"
  | "approved"
  | "invalid"
  | "own_family"
  | "rate_limited"
  | "error";

export interface JoinFamilyResult {
  status: JoinFamilyStatus;
  /** True when a row already existed for this user + code. */
  already?: boolean;
  /** Only set for "error"/"rate_limited" — safe to show the user. */
  message?: string;
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
  /** Belongs via their own profile (made the family) rather than a join. */
  isCreator: boolean;
  joinedAt: string;
  remindedAt: string | null;
}

const RATE_LIMITED = "53400";

function friendly(err: { code?: string; message?: string } | null): JoinFamilyResult {
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

  const row = (data ?? {}) as { status?: string; already?: boolean };
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
  }));
}

/** Any APPROVED member may approve. Returns null on success, else a message. */
export async function approveFamilyJoin(userId: string): Promise<string | null> {
  const supabase = getSupabase();
  if (!supabase) return "Not configured.";
  const { error } = await supabase.rpc("approve_family_join", { p_parent_user_id: userId });
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
