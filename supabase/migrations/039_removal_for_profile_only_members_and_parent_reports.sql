-- 039_removal_for_profile_only_members_and_parent_reports.sql
--
-- STATUS: applied to staging 2026-11-15. NOT applied to production.
-- Ships with 036 + 037 + 038 and the code.
--
-- Two findings from the independent verification pass that followed the third
-- rehearsal. Both were measured against PRODUCTION's real data, read-only,
-- not inferred from the migrations.
--
-- ===========================================================================
-- 1. A MEMBER WITH NO `parent_accounts` ROW CAN NEVER BE REMOVED
-- ===========================================================================
-- Membership has two storage shapes. 037 taught `remove_family_member()`
-- about the member who holds BOTH (production's three `parent_accounts`
-- rows), and 038 taught the roster about them. Neither noticed the third
-- shape: the member who holds ONLY `profiles.family_code` and has no link row
-- at all.
--
-- `remove_family_member()` deletes from `parent_accounts` and raises
-- 'That person cannot be removed.' when `row_count = 0`. For a profile-only
-- member that is every time. And because 038 correctly reports
-- `is_creator = false` for them, `FamilyMembersCard` now renders a Remove
-- button that errors on every click, while the member keeps full read access
-- for ever. 038 made the symptom visible; the cause is older.
--
-- **This is production, today, not a hypothetical.** Per family, profiles
-- carrying the code / also holding a link / profile-only:
--
--     JORDA-0N6T  1 / 0 / 1        NIRAN-0FI8  4 / 2 / 2
--     NIRAN-0LK2  2 / 1 / 1        SIDHA-0FBP  1 / 0 / 1
--
-- Most of those profile-only rows ARE the account holder, who is correctly
-- unremovable. Exactly one is not: a `player` in `NIRAN-0FI8`, not the
-- holder, with no link row — permanently unremovable by anyone, including the
-- holder. Reproduced on staging in that shape before writing this:
--
--     family_account_holder('FAKEFAM-A1')             -> the holder
--     remove_family_member(<the profile-only member>) -> 22023 refused
--     then, as that member: my_family_code resolves, 12 utr_entries,
--                           6 matches, 8 roster rows — unchanged
--
-- 037's write-up says removal "now revokes" and verifies it "in the legacy
-- double-linked shape". That is true and it is also the whole claim: it is
-- silent on this shape, and `/privacy` promises the general case.
--
-- THE FIX: removal is driven by MEMBERSHIP, not by the presence of a link
-- row. Delete the link if there is one, clear the profile column if it is
-- set, and raise only when neither applied — i.e. when the target was not a
-- member at all. The refusal message is unchanged, so it is still not an
-- oracle for who holds the family.
--
-- The "do not orphan the family" guard from 037 is kept but narrowed. Leaving
-- a family with no profile pointing at it would make
-- `family_account_holder()` return NULL, and a NULL comparison in the holder
-- guard is never true — so nobody would be protected. That only matters when
-- the holder is DERIVED from the earliest profile carrying the code. When a
-- `family_codes` row exists the holder is anchored there, `coalesce` finds it
-- first, and clearing the last profile column is safe.

create or replace function public.remove_family_member(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_code text;
  v_links_deleted int;
  v_rows int;
  v_target_has_code boolean;
  v_other_holders int;
  v_code_anchored boolean;
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

  -- Enforced, not accidental (037). Same message as the no-such-member case,
  -- so this is not an oracle for who holds the family.
  if p_user_id = public.family_account_holder(v_code) then
    raise exception 'That person cannot be removed.' using errcode = '22023';
  end if;

  select exists (
    select 1 from public.profiles
    where id = p_user_id and family_code = v_code
  ) into v_target_has_code;

  delete from public.parent_accounts
  where user_id = p_user_id and family_code = v_code;
  get diagnostics v_links_deleted = row_count;

  -- Not a member in EITHER shape. Only now is this a refusal.
  if v_links_deleted = 0 and not v_target_has_code then
    raise exception 'That person cannot be removed.' using errcode = '22023';
  end if;

  if v_target_has_code then
    select count(*) into v_other_holders
    from public.profiles
    where family_code = v_code and id <> p_user_id;

    -- Is the account holder anchored independently of the profile column?
    select exists (select 1 from public.family_codes fc where fc.code = v_code)
      into v_code_anchored;

    if v_other_holders > 0 or v_code_anchored then
      -- SECURITY DEFINER runs as the owner, so the 022/030/035 trigger's
      -- exemption applies and this write is allowed — the only reason it can
      -- happen here and not from the client.
      update public.profiles set family_code = null
      where id = p_user_id and family_code = v_code;
      get diagnostics v_rows = row_count;
      v_code_cleared := v_rows > 0;
    end if;
    -- Otherwise: they are the last profile pointing at a family with no
    -- `family_codes` row. Clearing it would leave family_account_holder()
    -- returning NULL and the holder guard protecting nobody, so leave it.
    -- Unreachable in practice: with no family_codes row the holder IS the
    -- earliest profile on the code, so a sole remaining profile holder is the
    -- holder, and the guard above already refused.
  end if;

  return jsonb_build_object(
    'status', 'removed',
    'family_code_cleared', v_code_cleared,
    'link_removed', v_links_deleted > 0
  );
end;
$fn$;

revoke all on function public.remove_family_member(uuid) from public, anon;
grant execute on function public.remove_family_member(uuid) to authenticated;

-- ===========================================================================
-- 2. `parent_reports` IS A THIRD CLIENT-WRITABLE FAMILY TABLE
-- ===========================================================================
-- The policy is called `parent_reports_service_insert`. It is granted to
-- `authenticated`, with `with check (is_family_member(family_code))`:
--
--     parent_reports | parent_reports_service_insert | INSERT
--                    | {authenticated} | with_check: is_family_member(family_code)
--
-- So any approved member of a family — including a player, including a
-- sibling — can insert a row with an arbitrary `title` and `public_url`, and
-- `loadParentReports()` (lib/db/family.ts) renders those rows to everyone in
-- the family. A policy whose NAME asserts a rule its body does not implement:
-- the same shape as the `encouragement_notes_insert_parent` bug 033 fixed.
--
-- Verified on staging before this migration: an approved PARENT and an
-- approved SIBLING PLAYER both inserted a `parent_reports` row successfully,
-- each stamped with the family code.
--
-- This is live on production and it makes two written rules false:
--   * CLAUDE.md: "Parents can write exactly two things: the season budget
--     (and its expenses) and encouragement notes. Everything else is
--     read-only. Enforced at the RLS layer."
--   * /privacy: "A parent can write two things: the season budget and its
--     expenses, and short notes to the player. Everything else is read-only."
--
-- THE FIX: drop the client INSERT. The app has never written this table —
-- `lib/db/account-export.ts` already documents "nothing generates these", and
-- `lib/db/family.ts` only selects from it — so this removes a write surface
-- and no feature. The service role is unaffected: it holds `bypassrls`, so a
-- future monthly-report generator does not need a policy at all. The family
-- READ policy stays untouched.
--
-- Not replaced with a `to service_role` policy on purpose: `service_role`
-- bypasses RLS, so such a policy would be decoration.

drop policy if exists "parent_reports_service_insert" on public.parent_reports;

-- ---------------------------------------------------------------------------
-- Verification (as real members on staging, NOT as postgres)
-- ---------------------------------------------------------------------------
--   -- 1. a profile-only member can now be removed, and loses access
--   select public.remove_family_member('<profile-only member>');
--     -> {"status":"removed","family_code_cleared":true,"link_removed":false}
--   -- then as them: 1 profile (own), 0 utr_entries, 0 matches, 0 roster rows,
--   --               my_family_code() -> NULL
--   -- 2. the holder is still unremovable, from every other member
--   select public.remove_family_member('<the holder>');   -> 22023
--   -- 3. a non-member still cannot be "removed"
--   select public.remove_family_member('<a stranger>');   -> 22023
--   -- 4. no client can write parent_reports any more
--   insert into public.parent_reports (...) -> 42501, as parent AND as player
--   -- 5. the family can still READ parent_reports
--   select count(*) from public.parent_reports;  -> unchanged
--
-- ROLLBACK:
--   -- restore 037's remove_family_member() (profile-only members become
--   -- unremovable again) and the client INSERT policy:
--   create policy "parent_reports_service_insert" on public.parent_reports
--     for insert to authenticated
--     with check (public.is_family_member(family_code));
--   -- then re-run the `create or replace function
--   -- public.remove_family_member(uuid)` block from
--   -- supabase/migrations/037_revoke_on_removal_and_narrow_family_reads.sql
--   -- verbatim (it is already `create or replace`, so grants are preserved
--   -- and nothing needs editing), followed by its revoke/grant pair.
