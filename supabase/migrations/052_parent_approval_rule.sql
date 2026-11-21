-- 052_parent_approval_rule.sql
--
-- STATUS: staging only (applied to gnlcpnsweqbtwpaqhqqg 2026-11-21 and
-- attack-tested as real roles, rolled back; evidence
-- ~/seeded-evidence/sat-prereview/p015/). Production waits for Niran's go
-- after the review (GO-SEQUENCE row 27, HANDOFF §J Step 27).
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
-- The rule, enforced here:
--   1. A family with NO approved parent yet: any approved member (a player)
--      may approve a pending parent joiner. Without this a family that a
--      player created could never get its first parent.
--   2. Once the family has an approved parent (either membership shape — the
--      creator's profiles.family_code with role 'parent', or an approved
--      parent_accounts row; family_member_count() counts both, as 045's cap
--      does), only an approved PARENT may approve another parent joiner:
--      is_parent_member(code) = the caller's own profiles.role = 'parent' AND
--      approved membership in either shape (050, mirroring 033). Otherwise
--      42501 'parent_approval_requires_parent'.
--      Player joiners: unchanged — any approved member may approve them.
--   3. Only an approved parent may remove an approved parent. A player
--      calling remove_family_member() on one gets 42501
--      'parents_only_remove_parent'. Parents keep their removal rights; the
--      account holder still cannot be removed by anyone (037); a player may
--      still remove a player, and may still clear a PENDING parent request
--      (deny_family_join is unchanged — refusing a request grants nothing).
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
-- Both functions are replaced with `create or replace` (same signature, same
-- return type), which keeps existing grants; the revoke/grant pair is stated
-- anyway so a re-run can never widen EXECUTE.

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
    -- 052: once the family has an approved parent (either shape), only an
    -- approved parent may approve another parent. A family with none yet may
    -- get its first parent from a player.
    if v_their_role = 'parent'
       and public.family_member_count(v_code, 'parent') > 0
       and not public.is_parent_member(v_code) then
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

  -- 052: only an approved parent may remove an approved parent of THIS
  -- family (either membership shape). Scoped to the caller's own family, so
  -- it says nothing the caller's roster does not already show.
  if exists (
       select 1 from public.profiles p
       where p.id = p_user_id
         and p.role = 'parent'
         and (
           p.family_code = v_code
           or exists (
             select 1 from public.parent_accounts pa
             where pa.user_id = p.id
               and pa.family_code = v_code
               and pa.status = 'approved'
           )
         )
     )
     and not public.is_parent_member(v_code) then
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
-- remove_family_member verbatim, then re-states the grants). Both are
-- `create or replace` with unchanged signatures, so existing grants survive,
-- but the revoke/grant pairs are included so a rollback can never leave
-- EXECUTE with PUBLIC/anon. Nothing else references the 052 error codes in
-- the database. After rollback the gap in docs/TODO.md is open again.
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
-- commit;
