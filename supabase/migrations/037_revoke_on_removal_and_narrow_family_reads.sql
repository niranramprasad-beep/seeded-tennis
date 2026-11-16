-- 037_revoke_on_removal_and_narrow_family_reads.sql
--
-- STATUS: applied to staging 2026-11-15. NOT applied to production.
-- Ships with 036 and the code. Do not apply 036 without this.
--
-- Three defects an independent review found in 036 within an hour of it
-- being written. Two of them made a sentence 036 itself shipped untrue.
--
-- ---------------------------------------------------------------------------
-- 1. REMOVAL DID NOT REVOKE — and this is production's actual data shape
-- ---------------------------------------------------------------------------
-- 036's header argues against setting a joiner's `profiles.family_code`
-- because `remove_family_member()` only deletes the `parent_accounts` row,
-- so a member holding both would keep access. It then shipped this sentence
-- in `/privacy`:
--
--   "the moment a member is removed from a family they can no longer see
--    anything about anyone in it"
--
-- which is false for exactly the users who hold both. Checked read-only on
-- production: ALL THREE `parent_accounts` rows belong to users whose own
-- `profiles.family_code` is the same code — the pre-023 shape, when the app
-- wrote both. Reproduced on staging: after removal the member still read 2
-- profiles and 3 `utr_entries` rows, `my_family_code()` still resolved, and
-- `family_members()` still listed them as an approved creator.
--
-- The access path is older than 036 (the previous `family_members_read`
-- matched the same way). The PROMISE was new, and a launch was about to be
-- made on it.
--
-- THE FIX: removal clears the profile column too — but only when somebody
-- else still holds that code, so the account holder cannot be evicted and a
-- family can never be left with no profile pointing at it. 026 says there is
-- "deliberately no way to evict the account holder here"; until now that was
-- true only by accident (the delete hit zero rows for a creator), and with
-- production's double-linked shape it was not true at all.

-- THE ACCOUNT HOLDER IS NOT REMOVABLE, and now that is enforced rather than
-- accidental. 026 says "there is deliberately no way to evict the account
-- holder here", which was true only because the delete hit zero rows for
-- someone with no `parent_accounts` link. Production's rows all carry BOTH a
-- link and the code, so the holder DID have a link and was removable — and
-- the first version of this migration then also cleared their
-- `profiles.family_code`, which locked the account holder out of their own
-- family on the say-so of any approved member. Caught on staging before this
-- shipped: as the joined player, `remove_family_member(<the holder>)`
-- returned removed and left the holder with `family_code = NULL`.
--
-- The holder is `family_codes.player_id` where that row exists (only 2 of
-- production's 6 families have one) and otherwise the earliest-created
-- profile carrying the code.

create or replace function public.family_account_holder(p_code text)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select fc.player_id from public.family_codes fc where fc.code = p_code),
    (select p.id from public.profiles p
      where p.family_code = p_code order by p.created_at, p.id limit 1)
  );
$$;

revoke all on function public.family_account_holder(text) from public, anon, authenticated;

create or replace function public.remove_family_member(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_code text;
  v_deleted int;
  v_other_holders int;
  v_code_cleared boolean := false;
begin
  if auth.uid() is null then
    raise exception 'Sign in first.' using errcode = '28000';
  end if;

  v_code := public.my_family_code();
  if v_code is null or not public.is_family_member(v_code) then
    raise exception 'You are not in a family.' using errcode = '22023';
  end if;

  if p_user_id = auth.uid() then
    raise exception 'You cannot remove yourself.' using errcode = '22023';
  end if;

  -- Enforced, not accidental. Same message as the no-such-request case, so
  -- this is not an oracle for who holds the family.
  if p_user_id = public.family_account_holder(v_code) then
    raise exception 'That person cannot be removed.' using errcode = '22023';
  end if;

  delete from public.parent_accounts
  where user_id = p_user_id and family_code = v_code;

  get diagnostics v_deleted = row_count;
  if v_deleted = 0 then
    raise exception 'That person cannot be removed.' using errcode = '22023';
  end if;

  -- The half that was missing, and the reason the /privacy removal sentence
  -- is true. SECURITY DEFINER runs as the owner, so the 022/030/035 trigger's
  -- exemption applies and this write is allowed — the only reason it can
  -- happen here and not from the client.
  select count(*) into v_other_holders
  from public.profiles
  where family_code = v_code and id <> p_user_id;

  if v_other_holders > 0 then
    update public.profiles set family_code = null
    where id = p_user_id and family_code = v_code;
    get diagnostics v_deleted = row_count;
    v_code_cleared := v_deleted > 0;
  end if;
  -- If they were somehow the last profile holding the code, leave it rather
  -- than orphan the family. The holder guard above means that case should be
  -- unreachable; this is the belt to its braces.

  return jsonb_build_object('status', 'removed', 'family_code_cleared', v_code_cleared);
end;
$fn$;

revoke all on function public.remove_family_member(uuid) from public, anon;
grant execute on function public.remove_family_member(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. THE FAMILY READ WAS THE WHOLE ROW — which is what 027 existed to close
-- ---------------------------------------------------------------------------
-- RLS cannot narrow columns. `authenticated` holds column-level SELECT on
-- every `profiles` column, so any policy that lets one user see another's row
-- lets them see ALL of it: email, gpa, birth_year, whop_membership_id, both
-- stripe ids, utr_profile_link, privacy_level, username, home_area.
--
-- 027's own write-up calls that row shape the hole it closed ("let any
-- signed-in user read the WHOLE row"). It closed it for strangers and left it
-- inside the family. 036 then widened the family case from one flow to both,
-- and to sibling-to-sibling — wider than Niran's decision, which was about
-- approved parents reading their player.
--
-- This is not hypothetical on production: family `NIRAN-0FI8` has FOUR
-- profiles holding the same code, so four accounts can read each other's
-- complete rows today, before any of this work.
--
-- THE FIX: the only way to narrow columns per row is to stop serving the
-- cross-user read through RLS at all. `family_members()` becomes the single
-- roster source and returns an ENUMERATED column list; `family_members_read`
-- is dropped. Net effect: strictly narrower than before 036 AND before this
-- whole piece of work, because the player-first whole-row read goes too.
--
-- What a family member can now see about another member: name, email, role,
-- status, whether they created the family, when they joined, the last
-- reminder, consent status, current UTR, grade, graduation year, onboarded,
-- target schools, gender. What they can NO LONGER see: gpa, birth_year,
-- whop_membership_id, stripe_customer_id, stripe_subscription_id,
-- utr_profile_link, privacy_level, username, home_area, commitment_date,
-- tournaments_played/goal, weaknesses, deletion_requested_at.
--
-- Two traps this file has to respect, both learned the hard way here:
--   * A function's return type cannot change under CREATE OR REPLACE — it
--     must be dropped first, or 42P13 (031, and §J step 8's rollback).
--   * A fresh CREATE after a DROP re-grants EXECUTE to PUBLIC. CREATE OR
--     REPLACE keeps grants; a new CREATE does not. Hence the revoke/grant
--     pair below, which is not optional (§J defect 4).

drop function if exists public.family_members();

create function public.family_members()
returns table (
  user_id uuid,
  name text,
  email text,
  role text,
  status text,
  is_creator boolean,
  joined_at timestamptz,
  reminded_at timestamptz,
  consent_status text,
  -- Added here so the roster no longer needs a cross-user `profiles` read.
  current_utr numeric,
  grade integer,
  graduation_year integer,
  onboarded boolean,
  target_school_slugs text[],
  gender text
)
language sql
security definer
set search_path = public
stable
as $fn$
  with fam as (select public.my_family_code() as code)
  select p.id, coalesce(nullif(p.name,''),'Family member'), p.email,
         coalesce(p.role,'player'), 'approved'::text, true,
         p.created_at, null::timestamptz, p.consent_status,
         p.current_utr, p.grade, p.graduation_year, p.onboarded,
         p.target_school_slugs, p.gender
  from public.profiles p, fam
  where fam.code is not null
    and p.family_code = fam.code
    and public.is_family_member(fam.code)
  union all
  select pa.user_id, coalesce(nullif(p2.name,''),'Family member'), p2.email,
         coalesce(p2.role,'parent'), pa.status, false,
         pa.created_at, pa.reminded_at, p2.consent_status,
         p2.current_utr, p2.grade, p2.graduation_year, p2.onboarded,
         p2.target_school_slugs, p2.gender
  from public.parent_accounts pa
  join public.profiles p2 on p2.id = pa.user_id, fam
  where fam.code is not null
    and pa.family_code = fam.code
    and public.is_family_member(fam.code)
  order by 6 desc, 5, 7
$fn$;

revoke all on function public.family_members() from public, anon;
grant execute on function public.family_members() to authenticated;

-- The cross-user profile read goes. `profiles_select_own` (your own row) and
-- 030's `account_active_required` carve-out stay untouched, so nobody loses
-- access to themselves.
drop policy if exists "family_members_read" on public.profiles;

-- `shares_approved_family_with()` is NOT dropped: the other six family read
-- policies from 036 (utr_entries, matches, tournament_entries,
-- coach_outreach, daily_checkins, cost_calculations) still use it, and none
-- of those tables holds a privileged column.

-- ---------------------------------------------------------------------------
-- Verification (as a test user on staging, NOT as postgres — postgres
-- bypasses RLS and every count comes back complete and looks like a pass)
-- ---------------------------------------------------------------------------
--   -- an approved member now reads exactly one profile row: their own
--   select count(*) from public.profiles;                     -> 1
--   -- and still gets the roster, with the player's real numbers
--   select count(*) from public.family_members();             -> 2+
--   -- and still reads the joined player's UTR history
--   select count(*) from public.utr_entries;                  -> 3
--   -- removal now actually revokes, in the legacy double-linked shape
--   select public.remove_family_member('<id>');
--     -> {"status":"removed","family_code_cleared":true}
--   -- then, as the removed member: 1 profile (own), 0 utr_entries,
--   --   my_family_code() -> NULL, family_members() -> 0 rows
--
-- ROLLBACK: docs/HANDOFF.md §J step 14.
