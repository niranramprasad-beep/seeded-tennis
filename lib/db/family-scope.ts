// "Which family does this user belong to?" — the one answer, for every
// query that scopes by family.
//
// There are TWO storage shapes for membership and most of this app only knew
// one of them:
//
//   the creator  -> public.profiles.family_code
//   every joiner -> public.parent_accounts(user_id, family_code,
//                   status='approved'), with profiles.family_code left NULL
//                   on purpose, because writing that column is the
//                   family-takeover hole migration 022/032 closed.
//
// Reading `profiles.family_code` therefore returns NULL for a parent who
// joined with the code, and every `if (!p.family_code) return []` guard in
// the data layer bailed out BEFORE RLS was ever consulted. That is what made
// /family show a parent none of their own player's real numbers — see
// migration 036 and docs/DECISIONS.md.
//
// `my_family_code()` (migration 026) is SECURITY DEFINER and answers across
// both shapes, for the caller only. Ask it, never the profile row.

import type { TypedSupabaseClient } from "@/lib/supabase/client";

export async function resolveMyFamilyCode(
  supabase: TypedSupabaseClient,
  signal?: AbortSignal
): Promise<string | null> {
  let q = supabase.rpc("my_family_code");
  if (signal) q = q.abortSignal(signal);
  const { data, error } = await q;
  if (error) return null;
  return (data as string | null) ?? null;
}

/** One row of `family_members()` (migrations 026 + 031 + 037).
 *
 * 037 widened this function to carry the roster columns and DROPPED the
 * `family_members_read` policy on `profiles`, because RLS cannot narrow
 * columns: any policy letting one member read another's row exposed the
 * whole row — gpa, birth_year, whop_membership_id, both stripe ids. The
 * enumerated list below is now the entire cross-user surface, and it is
 * enforced in the database rather than by whichever columns a caller
 * happens to select. Do not reintroduce a cross-user `profiles` read. */
export interface FamilyRosterRow {
  user_id: string;
  name: string | null;
  email: string | null;
  role: string | null;
  status: string | null;
  is_creator: boolean | null;
  joined_at: string | null;
  reminded_at: string | null;
  consent_status: string | null;
  current_utr: number | string | null;
  grade: number | null;
  graduation_year: number | null;
  onboarded: boolean | null;
  target_school_slugs: string[] | null;
  gender: string | null;
}

/** The caller's family roster. Pending members are returned (the approval
 * card needs them) — filter on `status` when you mean members. */
export async function loadFamilyRosterRows(
  supabase: TypedSupabaseClient,
  signal?: AbortSignal
): Promise<FamilyRosterRow[]> {
  let q = supabase.rpc("family_members");
  if (signal) q = q.abortSignal(signal);
  const { data, error } = await q;
  if (error) return [];
  return (data ?? []) as unknown as FamilyRosterRow[];
}

/** The user ids of every APPROVED member of the caller's family.
 *
 * Used instead of `profiles.eq("family_code", code)` for two reasons: that
 * filter cannot see a joiner, whose profile carries no code; and the rows a
 * joiner wrote while their request was still PENDING are stamped
 * `family_code = NULL` for ever (036's trigger freezes the column on
 * UPDATE, so re-saving cannot heal them). Scoping by owner instead of by
 * stamp is what makes those rows visible to the family — the read policies
 * in 036 key off the owner for exactly the same reason. */
export async function approvedFamilyMemberIds(
  supabase: TypedSupabaseClient,
  signal?: AbortSignal
): Promise<string[]> {
  const rows = await loadFamilyRosterRows(supabase, signal);
  return [...new Set(rows.filter((r) => r.status === "approved").map((r) => r.user_id))];
}
