-- 045_family_plan_one_family_and_caps.sql
--
-- STATUS: written 2026-11-19 for PR B. Applied and probed on STAGING
-- (gnlcpnsweqbtwpaqhqqg) first; production gets it after 044, per
-- docs/GO-SEQUENCE.md §3b and docs/HANDOFF.md §J Step 20. Needs 042
-- (family_has_tier) and 043 (join_family / approve_family_join with the
-- email check).
--
-- ===========================================================================
-- Why (owner decision, 2026-11-19 — docs/DECISIONS.md)
-- ===========================================================================
-- 042 unlocked a family when ANY approved member held the Family plan. A
-- member counts in every family they are approved in, so one Family plan
-- unlocked any number of families: a coach on one plan who joined ten
-- families unlocked all ten. The owner's rule:
--
--   1. A Family plan unlocks exactly ONE family — the one the paying account
--      currently belongs to (its HOME family; see home_family_code below).
--      A payer who leaves takes the unlock with them.
--   2. A family holds at most 4 players and 2 parent accounts. Over the cap,
--      the extra account cannot join or be approved. Existing members are
--      never removed, even in a family that is already over the cap.
--
-- ===========================================================================
-- What
-- ===========================================================================
-- * home_family_code(uuid): the one family an account belongs to. Same rule
--   the app has always used for "my family" (my_family_code(), 026): the
--   profile's own family_code (creators and production's legacy shape), else
--   the earliest APPROVED parent_accounts row. Ties are now broken
--   deterministically (created_at, then code) so the two can never disagree.
--   my_family_code() becomes a thin wrapper over it — same answer, by
--   construction. Internal: no EXECUTE for clients, or it would tell anyone
--   the family code of any uuid.
-- * family_has_tier(code, 'family'): the paying member must ALSO have this
--   code as their home family. Every other branch is 042's verbatim. The
--   'player' tier is untouched (it is never a family-wide unlock).
-- * family_member_cap(role) / family_member_count(code, role): 4 players,
--   2 parents; counted over APPROVED members in either membership shape,
--   one per person. Internal.
-- * join_family(): refuses an account with no profile row (22023
--   'profile_required' — it has no role, so it could otherwise dodge the cap
--   and 043's parent check by creating its profile after approval). Before
--   creating a PENDING row, returns
--   {"status":"family_full","role":...,"limit":...} if the family already
--   holds the cap for the caller's role. RETURNS rather than raises, like
--   every other expected outcome here, so the attempt log commits (023's
--   rate-limit lesson). 043's email check is kept, first, verbatim.
-- * approve_family_join(): refuses with P0001 'family_full_player' /
--   'family_full_parent' when approving would exceed the cap. Both RPCs take
--   a per-family advisory lock so two approvals at once cannot both pass the
--   count.
--
-- Not changed: deny / remove / remind / consent, every policy, the roster
-- (044 calls family_has_tier, so it follows automatically), and nothing is
-- deleted. Production on 2026-11-19 (read-only): two Family payers, both
-- players whose home family is the one they pay for; no family over either
-- cap; nobody in two families — so this changes no one's access today.


-- ---------------------------------------------------------------------------
-- 1. The one family an account belongs to.
-- ---------------------------------------------------------------------------
create or replace function public.home_family_code(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select p.family_code from public.profiles p where p.id = p_user_id),
    (select pa.family_code from public.parent_accounts pa
      where pa.user_id = p_user_id and pa.status = 'approved'
      order by pa.approved_at nulls last, pa.created_at, pa.family_code
      limit 1)
  )
$$;
revoke all on function public.home_family_code(uuid) from public, anon, authenticated;
grant execute on function public.home_family_code(uuid) to service_role;

-- Same answer as before for every account that has one family (all of
-- production); deterministic for anyone with more than one. `create or
-- replace` keeps 026's grants (authenticated needs EXECUTE: policies and
-- triggers call it as the signed-in user). Grants restated anyway so each
-- definition in this file carries its own, as the guard tests expect.
create or replace function public.my_family_code()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select public.home_family_code(auth.uid())
$$;
revoke all on function public.my_family_code() from public, anon;
grant execute on function public.my_family_code() to authenticated;

-- ---------------------------------------------------------------------------
-- 2. A Family plan unlocks its holder's HOME family only.
-- ---------------------------------------------------------------------------
create or replace function public.family_has_tier(p_code text, p_tier text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p_tier = 'free' then true
    when p_code is null or p_tier is null or p_tier not in ('player', 'family') then false
    -- Only ever an answer about the caller's OWN family. No caller (service
    -- role, postgres) = no restriction.
    when auth.uid() is not null and not public.is_family_member(p_code) then false
    else exists (
      select 1
      from public.profiles p
      where (
              p.family_code = p_code
              or exists (
                select 1 from public.parent_accounts pa
                where pa.user_id = p.id
                  and pa.family_code = p_code
                  and pa.status = 'approved'
              )
            )
        and (
              (p_tier = 'player' and p.subscription_tier in ('player', 'family'))
           or (p_tier = 'family' and p.subscription_tier = 'family'
               -- 045: one plan, one family — the payer's own.
               and public.home_family_code(p.id) = p_code)
            )
    )
  end
$$;
revoke all on function public.family_has_tier(text, text) from public, anon;
grant execute on function public.family_has_tier(text, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. The caps.
-- ---------------------------------------------------------------------------
create or replace function public.family_member_cap(p_role text)
returns int
language sql
immutable
set search_path = public
as $$
  -- Fails CLOSED: an unknown or NULL role gets no places (review, 2026-11-19).
  select case p_role when 'player' then 4 when 'parent' then 2 else 0 end
$$;
revoke all on function public.family_member_cap(text) from public, anon, authenticated;
grant execute on function public.family_member_cap(text) to service_role;

create or replace function public.family_member_count(p_code text, p_role text)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int
  from public.profiles p
  where p.role = p_role
    and (
      p.family_code = p_code
      or exists (
        select 1 from public.parent_accounts pa
        where pa.user_id = p.id
          and pa.family_code = p_code
          and pa.status = 'approved'
      )
    )
$$;
revoke all on function public.family_member_count(text, text) from public, anon, authenticated;
grant execute on function public.family_member_count(text, text) to service_role;

-- ---------------------------------------------------------------------------
-- 4. join_family(): 043's body + the cap, checked before a PENDING row.
-- ---------------------------------------------------------------------------
create or replace function public.join_family(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_recent int;
  v_exists boolean;
  v_own text;
  v_role text;
  v_cap int;
  v_existing public.parent_accounts%rowtype;
begin
  -- Expected outcomes RETURN a status so the attempt row below commits and
  -- the rate limiter counts it (023). Only "not signed in", "rate limited"
  -- and 043's "verify your email first" raise.
  if v_user is null then
    raise exception 'Sign in first.' using errcode = '28000';
  end if;

  -- 045 (review, 2026-11-19): an account with NO profile row has no role, so
  -- it skipped both the cap (no role, no limit) and 043's parent email check
  -- (not a 'parent' yet) — then created its profile as a player or parent
  -- AFTER being approved. parent_accounts.user_id references auth.users, not
  -- profiles, so nothing else stops it. The app always writes the profile
  -- first, so this refuses no real sign-up. Raised before the attempt is
  -- logged or the code looked up: the caller learns nothing about the code.
  if not exists (select 1 from public.profiles where id = v_user) then
    raise exception 'profile_required' using errcode = '22023';
  end if;

  if exists (select 1 from public.profiles where id = v_user and role = 'parent')
     and not public.email_is_verified(v_user) then
    raise exception 'verify_email_required' using errcode = '42501';
  end if;

  select count(*) into v_recent
  from public.family_join_attempts
  where user_id = v_user and created_at > now() - interval '1 hour';

  if v_recent >= 5 then
    raise exception 'Too many attempts. Try again later.' using errcode = '53400';
  end if;

  select exists(select 1 from public.families f where f.code = p_code) into v_exists;

  insert into public.family_join_attempts (user_id, attempted_code, succeeded)
  values (v_user, p_code, v_exists);

  if not v_exists then
    return jsonb_build_object('status','invalid');
  end if;

  select family_code, role into v_own, v_role from public.profiles where id = v_user;
  if v_own = p_code then
    return jsonb_build_object('status','own_family');
  end if;

  select * into v_existing from public.parent_accounts
  where user_id = v_user and family_code = p_code;

  if found then
    return jsonb_build_object('status', v_existing.status, 'already', true);
  end if;

  -- 045: the cap. Serialised per family with approve_family_join().
  perform pg_advisory_xact_lock(hashtext('seeded.family:' || p_code));
  v_cap := public.family_member_cap(v_role);
  if v_cap is not null and public.family_member_count(p_code, v_role) >= v_cap then
    return jsonb_build_object('status', 'family_full', 'role', v_role, 'limit', v_cap);
  end if;

  insert into public.parent_accounts (user_id, family_code, status)
  values (v_user, p_code, 'pending');

  return jsonb_build_object('status', 'pending', 'already', false);
end;
$$;
revoke all on function public.join_family(text) from public, anon;
grant execute on function public.join_family(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. approve_family_join(): 043's body + the cap, checked before approving.
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

