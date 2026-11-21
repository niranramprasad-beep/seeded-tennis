-- 052_parent_approval_rule.sql
--
-- STATUS: staging only (applied to gnlcpnsweqbtwpaqhqqg 2026-11-21; this
-- final version re-applied there as `052b_parent_approval_rule_home_family`
-- after an independent review; attack-tested as real roles, rolled back;
-- evidence ~/seeded-evidence/sat-prereview/p015/). Production waits for
-- Niran's go after the review (GO-SEQUENCE row 27, HANDOFF §J Step 27) and
-- gets only this file.
--
-- Who may approve a parent joiner — Niran's decision 2026-11-21 (DECISIONS
-- 2026-11-21, P-015 / S-005; docs/TODO.md "Who may approve a parent joiner").
--
-- The gap (found by the 050 review, reproduced on staging): "parent" is a
-- role chosen at sign-up, and ANY approved member may approve a join
-- (approve_family_join, 026/043/045). So a sibling player could sign up a
-- second account as a parent, request to join, approve it themselves, and
-- then write the parent-only budget (050) from it — or approve a fake second
-- parent alongside a real one. Separately, any approved member — a player
-- included — could remove an approved parent (remove_family_member, 037/039).
--
-- The rule, enforced here. "A parent of family F" below means
-- parent_acts_for_family(user, F): own profiles.role = 'parent' AND home
-- family (home_family_code(), the rule my_family_code() uses) = F — i.e. a
-- parent who can actually approve/remove in F. See section 0 for why.
--   1. A family with no parent of its own yet: any approved member (a
--      player) may approve a pending parent joiner. Without this a family
--      that a player created could never get its first parent.
--   2. Once the family has a parent of its own (creator shape via
--      profiles.family_code, or an approved parent_accounts row), only such
--      a parent may approve another parent joiner, else 42501
--      'parent_approval_requires_parent'. For the caller this is exactly
--      050's is_parent_member(code) (own role = 'parent' AND approved
--      member, mirroring 033). Player joiners: unchanged — any approved
--      member may approve them.
--   3. Only a parent of the family may remove a parent of the family. A
--      player calling remove_family_member() on one gets 42501
--      'parents_only_remove_parent'. Parents keep their removal rights; the
--      account holder still cannot be removed by anyone (037); a player may
--      still remove a player, clear a PENDING parent request (deny_family_join
--      is unchanged — refusing a request grants nothing), and remove a parent
--      whose home is ANOTHER family (that parent cannot act here at all).
--      remove_family_member() now takes 045's per-family advisory lock before
--      this check, so it serialises with approve_family_join().
--
-- Everything 043/045/030 check is kept, in the same order: the unverified-
-- parent refusal (043) is still first; the profile_required and cap checks
-- (045) still run under the same per-family advisory lock, before the
-- approval; consent is still recorded only by a parent approver (030). The
-- new check runs under that lock too, so two concurrent first-parent
-- approvals by players serialise and the second sees the first parent.
--
-- ACCEPTED RESIDUAL RISK (Niran, 2026-11-21): a player can still create a
-- fake FIRST parent with a second account and approve it, in a family that
-- has no parent yet. Consequence worth knowing: that fake parent then holds
-- the parent role — a real parent joining later must be approved by it (or
-- by another parent), and a player cannot remove it. It is visible on the
-- roster and counts against the 2-parent cap (045). The planned mitigation
-- is the "approved by" line in Settings → Family (parent_accounts.approved_by
-- is already written by approve_family_join; showing it is a follow-up).
--
-- Both RPCs are replaced with `create or replace` (same signature, same
-- return type), which keeps existing grants; the revoke/grant pairs are
-- stated anyway so a re-run can never widen EXECUTE. One new helper,
-- parent_acts_for_family(uuid, text), service_role-only.

-- ---------------------------------------------------------------------------
-- 0. parent_acts_for_family(user, code): the ONE definition of "a parent of
--    this family" that 052 uses, for the approver, for "the family already
--    has a parent", and for "the target is a parent".
--
--    = the user's own profiles.role = 'parent' AND their HOME family
--      (home_family_code(), the rule my_family_code() uses) is p_code.
--
--    Why home family and not plain membership (independent review of the
--    first 052, 2026-11-21): approve_family_join() and remove_family_member()
--    act on the CALLER's my_family_code(). A parent who created family B and
--    also joined family A has home B, so they can never approve or remove
--    anything in A. Counting them as "A's parent" (family_member_count /
--    is_family_member, any approved family) locked A: players could no
--    longer approve A's next parent nor remove that parent, and the parent
--    could not act in A either. Counting only parents who can act for A
--    means a parent who cannot act there never gatekeeps it.
--
--    home_family_code(u) = u's profiles.family_code, else u's earliest
--    approved parent_accounts row — so home = p_code implies approved
--    membership of p_code in one of the two shapes. For the CALLER of the
--    two RPCs, v_code IS their home family and membership is checked first,
--    so parent_acts_for_family(auth.uid(), v_code) is exactly 050's
--    is_parent_member(v_code) there (own role = 'parent' AND approved
--    member); using one helper for all three makes the approver set and the
--    counted set the same set by construction.
--
--    Not callable by clients (it would answer "is user X a parent whose home
--    is family Y" for any X/Y); the two SECURITY DEFINER RPCs run as owner.
-- ---------------------------------------------------------------------------
create or replace function public.parent_acts_for_family(p_user_id uuid, p_code text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_code is not null
     and exists (
       select 1 from public.profiles p
       where p.id = p_user_id and p.role = 'parent'
     )
     and public.home_family_code(p_user_id) = p_code
$$;
revoke all on function public.parent_acts_for_family(uuid, text) from public, anon, authenticated;
grant execute on function public.parent_acts_for_family(uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- 1. approve_family_join(): 045's body + the parent-approver rule.
-- ---------------------------------------------------------------------------
create or replace function public.approve_family_join(p_parent_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_code text;
  v_updated int;
  v_my_role text;
  v_their_role text;
  v_cap int;
  v_consent text := null;
begin
  if v_user is null then
    raise exception 'Sign in first.' using errcode = '28000';
  end if;

  if exists (select 1 from public.profiles where id = v_user and role = 'parent')
     and not public.email_is_verified(v_user) then
    raise exception 'verify_email_required' using errcode = '42501';
  end if;

  v_code := public.my_family_code();
  if v_code is null or not public.is_family_member(v_code) then
    raise exception 'You are not in a family.' using errcode = '22023';
  end if;

  -- 045: the cap. Only for a request that is really pending here, so this
  -- answers nothing about strangers.
  perform pg_advisory_xact_lock(hashtext('seeded.family:' || v_code));
  if exists (
    select 1 from public.parent_accounts
    where user_id = p_parent_user_id and family_code = v_code and status = 'pending'
  ) then
    select role into v_their_role from public.profiles where id = p_parent_user_id;
    -- No profile = no role = not countable: never approve it (see join_family).
    if v_their_role is null then
      raise exception 'profile_required' using errcode = '22023';
    end if;
    -- 052: once the family has a parent who can act for it, only such a
    -- parent may approve another parent. A family with none yet may get its
    -- first parent from a player.
    if v_their_role = 'parent'
       and exists (
         select 1 from public.profiles p
         where (
             p.family_code = v_code
             or exists (
               select 1 from public.parent_accounts pa
               where pa.user_id = p.id
                 and pa.family_code = v_code
                 and pa.status = 'approved'
             )
           )
           and public.parent_acts_for_family(p.id, v_code)
       )
       and not public.parent_acts_for_family(v_user, v_code) then
      raise exception 'parent_approval_requires_parent' using errcode = '42501';
    end if;
    v_cap := public.family_member_cap(v_their_role);
    if v_cap is not null and public.family_member_count(v_code, v_their_role) >= v_cap then
      raise exception '%', 'family_full_' || v_their_role using errcode = 'P0001';
    end if;
  end if;

  update public.parent_accounts
  set status = 'approved', approved_at = now(), approved_by = v_user
  where user_id = p_parent_user_id
    and family_code = v_code
    and status = 'pending';

  get diagnostics v_updated = row_count;
  if v_updated = 0 then
    raise exception 'No pending request from that person.' using errcode = '22023';
  end if;

  select role into v_my_role from public.profiles where id = v_user;

  if v_my_role = 'parent' then
    update public.profiles
    set consent_status = 'granted',
        consent_granted_at = now(),
        consent_granted_by = v_user
    where id = p_parent_user_id and consent_status = 'pending';

    get diagnostics v_updated = row_count;
    if v_updated > 0 then
      v_consent := 'granted';
    end if;
  else
    if exists (
      select 1 from public.profiles
      where id = p_parent_user_id and consent_status = 'pending'
    ) then
      v_consent := 'still_pending';
    end if;
  end if;

  return jsonb_build_object('status', 'approved', 'consent', v_consent);
end;
$$;
revoke all on function public.approve_family_join(uuid) from public, anon;
grant execute on function public.approve_family_join(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. remove_family_member(): 039's body + only a parent removes a parent.
-- ---------------------------------------------------------------------------
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

  -- 052: serialise with approve_family_join / join_family on 045's
  -- per-family lock, so a pending parent cannot be approved between the
  -- check below and the DELETE (which removes pending and approved links).
  perform pg_advisory_xact_lock(hashtext('seeded.family:' || v_code));

  -- 052: only a parent who can act for this family may remove a parent who
  -- can act for it. Scoped to the caller's own family, so it says nothing
  -- the caller's roster does not already show.
  if public.parent_acts_for_family(p_user_id, v_code)
     and not public.parent_acts_for_family(auth.uid(), v_code) then
    raise exception 'parents_only_remove_parent' using errcode = '42501';
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
-- ROLLBACK (pasteable; restores 045's approve_family_join and 039's
-- remove_family_member verbatim — 039's body has no advisory lock, as
-- before 052 — re-states the grants, then drops 052's helper, which nothing
-- else references once both bodies are restored). Both are `create or
-- replace` with unchanged signatures, so existing grants survive, but the
-- revoke/grant pairs are included so a rollback can never leave EXECUTE with
-- PUBLIC/anon. After rollback the gap in docs/TODO.md is open again.
-- ===========================================================================
-- begin;
--
-- create or replace function public.approve_family_join(p_parent_user_id uuid)
-- returns jsonb
-- language plpgsql
-- security definer
-- set search_path = public
-- as $$
-- declare
--   v_user uuid := auth.uid();
--   v_code text;
--   v_updated int;
--   v_my_role text;
--   v_their_role text;
--   v_cap int;
--   v_consent text := null;
-- begin
--   if v_user is null then
--     raise exception 'Sign in first.' using errcode = '28000';
--   end if;
--
--   if exists (select 1 from public.profiles where id = v_user and role = 'parent')
--      and not public.email_is_verified(v_user) then
--     raise exception 'verify_email_required' using errcode = '42501';
--   end if;
--
--   v_code := public.my_family_code();
--   if v_code is null or not public.is_family_member(v_code) then
--     raise exception 'You are not in a family.' using errcode = '22023';
--   end if;
--
--   perform pg_advisory_xact_lock(hashtext('seeded.family:' || v_code));
--   if exists (
--     select 1 from public.parent_accounts
--     where user_id = p_parent_user_id and family_code = v_code and status = 'pending'
--   ) then
--     select role into v_their_role from public.profiles where id = p_parent_user_id;
--     if v_their_role is null then
--       raise exception 'profile_required' using errcode = '22023';
--     end if;
--     v_cap := public.family_member_cap(v_their_role);
--     if v_cap is not null and public.family_member_count(v_code, v_their_role) >= v_cap then
--       raise exception '%', 'family_full_' || v_their_role using errcode = 'P0001';
--     end if;
--   end if;
--
--   update public.parent_accounts
--   set status = 'approved', approved_at = now(), approved_by = v_user
--   where user_id = p_parent_user_id
--     and family_code = v_code
--     and status = 'pending';
--
--   get diagnostics v_updated = row_count;
--   if v_updated = 0 then
--     raise exception 'No pending request from that person.' using errcode = '22023';
--   end if;
--
--   select role into v_my_role from public.profiles where id = v_user;
--
--   if v_my_role = 'parent' then
--     update public.profiles
--     set consent_status = 'granted',
--         consent_granted_at = now(),
--         consent_granted_by = v_user
--     where id = p_parent_user_id and consent_status = 'pending';
--
--     get diagnostics v_updated = row_count;
--     if v_updated > 0 then
--       v_consent := 'granted';
--     end if;
--   else
--     if exists (
--       select 1 from public.profiles
--       where id = p_parent_user_id and consent_status = 'pending'
--     ) then
--       v_consent := 'still_pending';
--     end if;
--   end if;
--
--   return jsonb_build_object('status', 'approved', 'consent', v_consent);
-- end;
-- $$;
-- revoke all on function public.approve_family_join(uuid) from public, anon;
-- grant execute on function public.approve_family_join(uuid) to authenticated;
--
-- create or replace function public.remove_family_member(p_user_id uuid)
-- returns jsonb
-- language plpgsql
-- security definer
-- set search_path = public
-- as $fn$
-- declare
--   v_code text;
--   v_links_deleted int;
--   v_rows int;
--   v_target_has_code boolean;
--   v_other_holders int;
--   v_code_anchored boolean;
--   v_code_cleared boolean := false;
-- begin
--   if auth.uid() is null then
--     raise exception 'Sign in first.' using errcode = '28000';
--   end if;
--
--   v_code := public.my_family_code();
--   if v_code is null or not public.is_family_member(v_code) then
--     raise exception 'You are not in a family.' using errcode = '22023';
--   end if;
--
--   if p_user_id = auth.uid() then
--     raise exception 'You cannot remove yourself.' using errcode = '22023';
--   end if;
--
--   if p_user_id = public.family_account_holder(v_code) then
--     raise exception 'That person cannot be removed.' using errcode = '22023';
--   end if;
--
--   select exists (
--     select 1 from public.profiles
--     where id = p_user_id and family_code = v_code
--   ) into v_target_has_code;
--
--   delete from public.parent_accounts
--   where user_id = p_user_id and family_code = v_code;
--   get diagnostics v_links_deleted = row_count;
--
--   if v_links_deleted = 0 and not v_target_has_code then
--     raise exception 'That person cannot be removed.' using errcode = '22023';
--   end if;
--
--   if v_target_has_code then
--     select count(*) into v_other_holders
--     from public.profiles
--     where family_code = v_code and id <> p_user_id;
--
--     select exists (select 1 from public.family_codes fc where fc.code = v_code)
--       into v_code_anchored;
--
--     if v_other_holders > 0 or v_code_anchored then
--       update public.profiles set family_code = null
--       where id = p_user_id and family_code = v_code;
--       get diagnostics v_rows = row_count;
--       v_code_cleared := v_rows > 0;
--     end if;
--   end if;
--
--   return jsonb_build_object(
--     'status', 'removed',
--     'family_code_cleared', v_code_cleared,
--     'link_removed', v_links_deleted > 0
--   );
-- end;
-- $fn$;
-- revoke all on function public.remove_family_member(uuid) from public, anon;
-- grant execute on function public.remove_family_member(uuid) to authenticated;
--
-- drop function if exists public.parent_acts_for_family(uuid, text);
--
-- commit;
