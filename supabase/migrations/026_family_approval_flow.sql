-- 026_family_approval_flow.sql  —  P0-2, part 2
--
-- STATUS: APPLIED TO STAGING 2026-11-14. NOT APPLIED TO PRODUCTION.
-- Ships as one unit with 023. Applying 023 without this leaves the app with
-- no way to approve, deny, list or remove anyone.
--
-- 023 made joining safe (pending until approved). This makes the resulting
-- family usable, per Niran's decision of 2026-11-14:
--   * whoever signs up first creates the family
--   * anyone joining with the code lands PENDING
--   * ANY approved member can Approve or Deny  (023 only let the player do
--     it, because approve_family_join() keyed off the approver's own
--     profiles.family_code — a parent never has one)
--   * pending members read nothing
--
-- A NOTE ON THE ONE DELIBERATE DISCLOSURE
-- The joiner's waiting screen says "Waiting for <first name> to approve".
-- A pending member can read nothing through RLS, so that name comes from
-- my_pending_family_request() below, which returns ONLY a first name and
-- only to the person who actually holds a pending row for that family.
-- That is information they already have (they typed the family's code), and
-- a bare first name is the smallest thing that makes the screen not say
-- "waiting for someone". No email, no UTR, no surname, nothing else.

-- ---------------------------------------------------------------------------
-- 1. Remind timestamp
-- ---------------------------------------------------------------------------

alter table public.parent_accounts
  add column if not exists reminded_at timestamptz;

-- ---------------------------------------------------------------------------
-- 2. Who am I in a family?
-- ---------------------------------------------------------------------------
-- current_family_code() reads only the caller's own profiles.family_code, so
-- it returns NULL for a parent who joined by code (their link lives in
-- parent_accounts). Anything that needs "the family this user belongs to"
-- must use this instead.

create or replace function public.my_family_code()
returns text
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    (select p.family_code from public.profiles p where p.id = auth.uid()),
    (select pa.family_code from public.parent_accounts pa
      where pa.user_id = auth.uid() and pa.status = 'approved'
      order by pa.approved_at nulls last limit 1)
  )
$$;

revoke all on function public.my_family_code() from public, anon;
grant execute on function public.my_family_code() to authenticated;

-- ---------------------------------------------------------------------------
-- 3. The roster
-- ---------------------------------------------------------------------------
-- Unions the two ways of belonging: a profiles row carrying the family_code
-- (the creator / player) and a parent_accounts link (everyone who joined).
-- Approved members only — a pending member calling this gets nothing.

create or replace function public.family_members()
returns table (
  user_id uuid,
  name text,
  email text,
  role text,
  status text,
  is_creator boolean,
  joined_at timestamptz,
  reminded_at timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
  with fam as (select public.my_family_code() as code)
  select p.id, coalesce(nullif(p.name,''),'Family member'), p.email,
         coalesce(p.role,'player'), 'approved'::text, true,
         p.created_at, null::timestamptz
  from public.profiles p, fam
  where fam.code is not null
    and p.family_code = fam.code
    and public.is_family_member(fam.code)
  union all
  select pa.user_id, coalesce(nullif(p2.name,''),'Family member'), p2.email,
         coalesce(p2.role,'parent'), pa.status, false,
         pa.created_at, pa.reminded_at
  from public.parent_accounts pa
  join public.profiles p2 on p2.id = pa.user_id, fam
  where fam.code is not null
    and pa.family_code = fam.code
    and public.is_family_member(fam.code)
  order by 6 desc, 5, 7
$$;

revoke all on function public.family_members() from public, anon;
grant execute on function public.family_members() to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Approve / deny / remove — any APPROVED member
-- ---------------------------------------------------------------------------

create or replace function public.approve_family_join(p_parent_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
  v_updated int;
begin
  if auth.uid() is null then
    raise exception 'Sign in first.' using errcode = '28000';
  end if;

  -- my_family_code() + is_family_member() together mean: you must already be
  -- an APPROVED member. A pending member's my_family_code() is NULL, so they
  -- cannot approve themselves or anyone else.
  v_code := public.my_family_code();
  if v_code is null or not public.is_family_member(v_code) then
    raise exception 'You are not in a family.' using errcode = '22023';
  end if;

  update public.parent_accounts
  set status = 'approved', approved_at = now(), approved_by = auth.uid()
  where user_id = p_parent_user_id
    and family_code = v_code
    and status = 'pending';

  get diagnostics v_updated = row_count;
  if v_updated = 0 then
    raise exception 'No pending request from that person.' using errcode = '22023';
  end if;

  return jsonb_build_object('status','approved');
end;
$$;

create or replace function public.deny_family_join(p_parent_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
  v_deleted int;
begin
  if auth.uid() is null then
    raise exception 'Sign in first.' using errcode = '28000';
  end if;

  v_code := public.my_family_code();
  if v_code is null or not public.is_family_member(v_code) then
    raise exception 'You are not in a family.' using errcode = '22023';
  end if;

  -- Deny deletes the row outright rather than parking it in a 'denied'
  -- state. A denied person can then try again with a correct code (and is
  -- still rate-limited by 023), and we keep no permanent record of someone
  -- having been refused — which, for a product used by minors and their
  -- families, is the kinder default.
  delete from public.parent_accounts
  where user_id = p_parent_user_id
    and family_code = v_code
    and status = 'pending';

  get diagnostics v_deleted = row_count;
  if v_deleted = 0 then
    raise exception 'No pending request from that person.' using errcode = '22023';
  end if;

  return jsonb_build_object('status','denied');
end;
$$;

create or replace function public.remove_family_member(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
  v_deleted int;
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

  -- Only joined links can be removed. The creator belongs via their own
  -- profiles.family_code, and 022 forbids changing that from the client —
  -- so there is deliberately no way to evict the account holder here.
  delete from public.parent_accounts
  where user_id = p_user_id and family_code = v_code;

  get diagnostics v_deleted = row_count;
  if v_deleted = 0 then
    raise exception 'That person cannot be removed.' using errcode = '22023';
  end if;

  return jsonb_build_object('status','removed');
end;
$$;

revoke all on function public.approve_family_join(uuid) from public, anon;
revoke all on function public.deny_family_join(uuid) from public, anon;
revoke all on function public.remove_family_member(uuid) from public, anon;
grant execute on function public.approve_family_join(uuid) to authenticated;
grant execute on function public.deny_family_join(uuid) to authenticated;
grant execute on function public.remove_family_member(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. The joiner's side
-- ---------------------------------------------------------------------------

create or replace function public.my_pending_family_request()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.parent_accounts%rowtype;
  v_first text;
begin
  if auth.uid() is null then
    return null;
  end if;

  select * into v_row from public.parent_accounts
  where user_id = auth.uid() and status = 'pending'
  order by created_at desc limit 1;

  if not found then
    return null;
  end if;

  -- First name only. See the note at the top of this file.
  select split_part(coalesce(nullif(p.name,''),'your family'), ' ', 1)
  into v_first
  from public.profiles p
  where p.family_code = v_row.family_code and p.role = 'player'
  order by p.created_at limit 1;

  return jsonb_build_object(
    'status','pending',
    'familyCode', v_row.family_code,
    'approverFirstName', coalesce(v_first,'your family'),
    'remindedAt', v_row.reminded_at,
    'requestedAt', v_row.created_at
  );
end;
$$;

create or replace function public.remind_family_approval()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.parent_accounts%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Sign in first.' using errcode = '28000';
  end if;

  select * into v_row from public.parent_accounts
  where user_id = auth.uid() and status = 'pending'
  order by created_at desc limit 1;

  if not found then
    raise exception 'You have no pending request.' using errcode = '22023';
  end if;

  -- Once an hour. This sends NOTHING — Seeded has no email or push. All it
  -- does is bump a timestamp so the request sorts to the top of the
  -- approver's card next time they open the app, and so the waiting screen
  -- can say when it was last nudged. The UI must not claim otherwise.
  if v_row.reminded_at is not null and v_row.reminded_at > now() - interval '1 hour' then
    raise exception 'You just reminded them. Try again later.' using errcode = '53400';
  end if;

  update public.parent_accounts set reminded_at = now() where id = v_row.id;
  return jsonb_build_object('status','reminded','remindedAt', now());
end;
$$;

revoke all on function public.my_pending_family_request() from public, anon;
revoke all on function public.remind_family_approval() from public, anon;
grant execute on function public.my_pending_family_request() to authenticated;
grant execute on function public.remind_family_approval() to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Let a joiner withdraw / re-enter a different code
-- ---------------------------------------------------------------------------
-- "Wrong code? Re-enter" needs the old pending row gone before join_family()
-- will accept a new one (it returns `already` for an existing row).

create or replace function public.cancel_my_family_request()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_deleted int;
begin
  if auth.uid() is null then
    raise exception 'Sign in first.' using errcode = '28000';
  end if;

  delete from public.parent_accounts
  where user_id = auth.uid() and status = 'pending';

  get diagnostics v_deleted = row_count;
  return jsonb_build_object('status','cancelled','removed',v_deleted);
end;
$$;

revoke all on function public.cancel_my_family_request() from public, anon;
grant execute on function public.cancel_my_family_request() to authenticated;
