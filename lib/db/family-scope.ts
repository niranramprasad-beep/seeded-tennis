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

/** The user ids of every APPROVED member of the caller's family, from the
 * `family_members()` RPC (migrations 026 + 031).
 *
 * Used instead of `profiles.eq("family_code", code)` for the same reason:
 * that filter cannot see a joiner, whose profile carries no code. Pending
 * members are excluded here as well as by RLS — a pending request is not a
 * member and must not appear on the roster. */
export async function approvedFamilyMemberIds(
  supabase: TypedSupabaseClient,
  signal?: AbortSignal
): Promise<string[]> {
  let q = supabase.rpc("family_members");
  if (signal) q = q.abortSignal(signal);
  const { data, error } = await q;
  if (error) return [];
  const rows = (data ?? []) as { user_id: string; status: string | null }[];
  return [...new Set(rows.filter((r) => r.status === "approved").map((r) => r.user_id))];
}
