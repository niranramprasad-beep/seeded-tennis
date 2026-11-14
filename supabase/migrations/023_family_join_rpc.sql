-- 023_family_join_rpc.sql  —  P0-2
--
-- STATUS: APPLIED TO STAGING 2026-11-14. NOT APPLIED TO PRODUCTION.
--
-- THE HOLE (confirmed live on production, read-only, 2026-11-10/14):
--   1. `families` has policy "families readable" USING (true) for every
--      authenticated user. Anyone signed in can list EVERY family code.
--   2. `parent_accounts_insert_self` only checks `user_id = auth.uid()`.
--      So any user can insert a parent link for ANY family_code.
--   3. `is_family_member()` / `is_parent_member()` then return true, which
--      unlocks that child's profile (email, GPA, grade), UTR history,
--      matches, outreach, check-ins — and write access to the season budget.
--   4. Codes are `FIRSTNAME-XXXX` from Math.random(), guessable even
--      without step 1.
--
-- Four steps, any one of which is trivial for a signed-in stranger. The
-- data behind it belongs to minors.
--
-- THE FIX
--   * Stop code enumeration: `families` is readable by members only.
--   * Stop self-service linking: no direct INSERT on `parent_accounts`.
--     Joining goes through join_family(), a SECURITY DEFINER RPC.
--   * Make a guessed code useless on its own: a join creates a PENDING
--     link. Only the player (or, for an under-13 account, the parent who
--     created it) can approve, via approve_family_join().
--   * is_family_member()/is_parent_member() only count APPROVED links, so
--     a pending row grants nothing.
--   * Rate-limit attempts so the code space can't be brute-forced.
--   * Generate new codes from crypto-quality randomness, not Math.random().
--
-- BACKWARDS COMPATIBILITY: every parent_accounts row that exists when this
-- runs is backfilled to 'approved'. Nobody currently linked gets locked out.

-- ---------------------------------------------------------------------------
-- 1. Pending/approved state on parent_accounts
-- ---------------------------------------------------------------------------

alter table public.parent_accounts
  add column if not exists status text not null default 'pending';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname='parent_accounts_status_check'
      and conrelid='public.parent_accounts'::regclass
  ) then
    alter table public.parent_accounts
      add constraint parent_accounts_status_check
      check (status in ('pending','approved'));
  end if;
end $$;

alter table public.parent_accounts
  add column if not exists approved_at timestamptz,
  add column if not exists approved_by uuid references public.profiles(id) on delete set null;

-- Anyone already linked stays linked. This is the line that makes the
-- migration safe to run against production with live families.
update public.parent_accounts
set status = 'approved', approved_at = coalesce(approved_at, now())
where status <> 'approved';

create index if not exists parent_accounts_status_idx
  on public.parent_accounts (family_code, status);

-- ---------------------------------------------------------------------------
-- 2. Helpers only count APPROVED links
-- ---------------------------------------------------------------------------
-- Same signatures and SECURITY DEFINER posture as before; the only change is
-- `and pa.status = 'approved'`. A pending row must grant nothing at all.

create or replace function public.is_family_member(target_family_code text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.family_code = target_family_code
  )
  or exists (
    select 1 from public.parent_accounts pa
    where pa.user_id = auth.uid()
      and pa.family_code = target_family_code
      and pa.status = 'approved'
  )
$$;

create or replace function public.is_parent_member(target_family_code text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.family_code = target_family_code
      and p.role = 'parent'
  )
  or exists (
    select 1 from public.parent_accounts pa
    where pa.user_id = auth.uid()
      and pa.family_code = target_family_code
      and pa.status = 'approved'
  )
$$;

-- ---------------------------------------------------------------------------
-- 3. Close the two open doors
-- ---------------------------------------------------------------------------

-- (a) No more enumerating every family code in the system.
drop policy if exists "families readable" on public.families;
create policy families_readable_by_members on public.families
  for select to authenticated
  using (public.is_family_member(code));

-- (b) No more self-service parent links. join_family() is the only way in.
drop policy if exists "parent_accounts_insert_self" on public.parent_accounts;

-- Creating a family at signup still needs an insert; that path is the
-- player creating their OWN family and is unchanged.

-- ---------------------------------------------------------------------------
-- 4. Rate limiting
-- ---------------------------------------------------------------------------

create table if not exists public.family_join_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  attempted_code text not null,
  succeeded boolean not null,
  created_at timestamptz not null default now()
);

alter table public.family_join_attempts enable row level security;

create index if not exists family_join_attempts_user_time_idx
  on public.family_join_attempts (user_id, created_at desc);

-- Deliberately no policies: only SECURITY DEFINER functions touch this.
-- With RLS on and no policy, `authenticated` can neither read nor write it,
-- so it can't be used to probe which codes someone else has tried.
revoke all on table public.family_join_attempts from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. join_family()
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
  v_existing public.parent_accounts%rowtype;
begin
  -- WHY THIS RETURNS A STATUS INSTEAD OF RAISING (found by the staging
  -- attack test, 2026-11-14):
  -- The first version logged the attempt and then RAISED for an invalid
  -- code. Raising rolls the function's own work back to its savepoint —
  -- and under PostgREST every RPC call is its own transaction — so the
  -- attempt row vanished with the exception. The rate limiter therefore
  -- counted zero failed attempts and never fired. Brute force was
  -- unlimited, which is the one thing it existed to stop.
  --
  -- So: expected outcomes (invalid / own family / already linked /
  -- pending) RETURN, which lets the attempt row commit. Only "not signed
  -- in" and "rate limited" raise, and neither needs to be logged.
  --
  -- Yes, a distinguishable 'invalid' vs 'pending' is an oracle for which
  -- codes exist. That is unavoidable — a user has to learn whether their
  -- code worked. It is acceptable only BECAUSE the rate limit now works
  -- and because a valid code on its own still grants nothing until a
  -- member approves it. If you ever weaken the rate limit, revisit this.
  if v_user is null then
    raise exception 'Sign in first.' using errcode = '28000';
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

  select family_code into v_own from public.profiles where id = v_user;
  if v_own = p_code then
    return jsonb_build_object('status','own_family');
  end if;

  select * into v_existing from public.parent_accounts
  where user_id = v_user and family_code = p_code;

  if found then
    return jsonb_build_object('status', v_existing.status, 'already', true);
  end if;

  insert into public.parent_accounts (user_id, family_code, status)
  values (v_user, p_code, 'pending');

  return jsonb_build_object('status', 'pending', 'already', false);
end;
$$;

revoke all on function public.join_family(text) from public, anon;
grant execute on function public.join_family(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. approve_family_join()
-- ---------------------------------------------------------------------------
-- Only someone who already belongs to the family by their OWN profile
-- (i.e. the player, or a parent who created an under-13 account) may
-- approve. An approved parent cannot approve further parents — otherwise
-- one accepted link would reopen the door.

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
begin
  if v_user is null then
    raise exception 'Sign in first.' using errcode = '28000';
  end if;

  select family_code into v_code from public.profiles where id = v_user;
  if v_code is null then
    raise exception 'You are not in a family.' using errcode = '22023';
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

  return jsonb_build_object('status', 'approved');
end;
$$;

revoke all on function public.approve_family_join(uuid) from public, anon;
grant execute on function public.approve_family_join(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Unguessable codes
-- ---------------------------------------------------------------------------
-- Replaces `FIRSTNAME-XXXX` from Math.random(). No name prefix (it leaked
-- the player's first name to anyone holding a code) and ~10^14 space from
-- gen_random_bytes. The app should call this instead of generating its own.

create or replace function public.generate_family_code()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- no I/O/0/1
  candidate text;
  i int;
begin
  loop
    candidate := '';
    for i in 1..12 loop
      candidate := candidate || substr(alphabet, 1 + (get_byte(gen_random_bytes(1), 0) % length(alphabet)), 1);
    end loop;
    exit when not exists (select 1 from public.families where code = candidate);
  end loop;
  return candidate;
end;
$$;

revoke all on function public.generate_family_code() from public, anon;
grant execute on function public.generate_family_code() to authenticated;

-- ---------------------------------------------------------------------------
-- 8. Make the APPROVED-parent link actually grant read access
-- ---------------------------------------------------------------------------
-- Found by the staging attack test (2026-11-14): with 022 + this migration
-- applied, approval succeeded but the approved parent still saw nothing.
--
-- Why: the family-read policies below keyed off current_family_code(),
-- i.e. the reader's OWN profiles.family_code. The only way a parent ever
-- got that set was by writing it to their own profile — which is precisely
-- the hole 022 closes. So the legitimate parent-read path and the attack
-- were the same mechanism, and closing one closed the other.
--
-- These now go through is_family_member(), which (as redefined above)
-- means "owns this family_code on their profile, OR holds an APPROVED
-- parent_accounts link". Strictly safer than before: previously anyone
-- could self-assign the code, now a member must approve.
--
-- is_family_member() is SECURITY DEFINER and so bypasses RLS — no risk of
-- the profiles-policy recursion that 004 had to fix.

drop policy if exists "utr_entries_select_family" on public.utr_entries;
create policy "utr_entries_select_family"
on public.utr_entries for select
to authenticated
using (
  exists (
    select 1 from public.profiles owner
    where owner.id = utr_entries.user_id
      and owner.family_code is not null
      and public.is_family_member(owner.family_code)
  )
);

drop policy if exists "family_members_read" on public.profiles;
create policy "family_members_read" on public.profiles
  for select
  to authenticated
  using (
    family_code is not null
    and public.is_family_member(family_code)
  );
