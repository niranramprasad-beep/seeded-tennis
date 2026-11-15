-- 030_under13_parent_consent.sql  —  P0-8 (COPPA half)
--
-- STATUS: APPLIED TO STAGING 2026-11-14. NOT APPLIED TO PRODUCTION.
--
-- WHAT WAS THERE: nothing. MASTER_ROADMAP recorded the under-13 gate as
-- "client-side only", which was generous — there was no gate at all in the
-- shipped signup flow, and no birth date or birth year was stored, so the
-- product could not have told you which of its users were under 13.
--
-- ---------------------------------------------------------------------------
-- What this does and does not claim
-- ---------------------------------------------------------------------------
-- It does NOT verify that anybody is an adult. There is no document check,
-- no credit-card ping, no email round-trip to a "verified" parent. Seeded
-- cannot do any of those, so the flow says so in those words at the point of
-- consent (see components/seeded/family/join-requests-card.tsx). "Keep it
-- simple and honest — no fake verification" was the instruction, and a
-- checkbox labelled "Verified parent" would have been the dishonest version.
--
-- What it DOES do, and what is therefore true:
--   * birth year is collected and stored, so the product knows who is
--     under 13 instead of guessing from `grade`
--   * an under-13 account exists but is INACTIVE: it can read and write
--     nothing except its own profile row, enforced by RLS, not by the UI
--   * it becomes active only when an adult account already in that family
--     records consent, naming themselves as parent or guardian
--   * the consent is stored with who gave it and when
--
-- ---------------------------------------------------------------------------
-- Birth YEAR, not birth date. Deliberate.
-- ---------------------------------------------------------------------------
-- A full date of birth would make the age exact. It would also add a
-- precise, permanent identifier for a child to a database whose whole P0-8
-- problem is how much it already holds about minors. Year alone cannot
-- decide the case of someone who turns 13 this year, so the rule below
-- rounds the uncertainty TOWARD asking for consent:
--
--   consent required when (current year - birth year) <= 13
--
-- Someone born in 2013, asked in 2026, is 12 or 13 depending on the month.
-- They are treated as 12. The cost is that some 13-year-olds are asked for a
-- parent's consent they do not legally need — on a product about a minor's
-- college recruiting, that is not a cost worth trading real privacy for. The
-- cost of the other rounding is an under-13 account running unconsented.

alter table public.profiles
  add column if not exists birth_year integer,
  add column if not exists consent_status text not null default 'not_required',
  add column if not exists consent_granted_at timestamptz,
  add column if not exists consent_granted_by uuid references public.profiles(id) on delete set null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_birth_year_check' and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles add constraint profiles_birth_year_check
      check (birth_year is null or (birth_year >= 1900 and birth_year <= 2100));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_consent_status_check' and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles add constraint profiles_consent_status_check
      check (consent_status in ('not_required', 'pending', 'granted'));
  end if;
end $$;

-- "Nothing about a minor is publicly visible by default." 027 made that true
-- for everyone by dropping the policy that read this column, so the column is
-- now a record of a choice nothing acts on. The default was 'friends', from
-- a friends feature that no longer exists. New accounts record 'private',
-- which is what is actually the case. Existing rows are left exactly as the
-- person set them — rewriting someone's stored preference to make a default
-- look tidy would be rewriting history.
alter table public.profiles alter column privacy_level set default 'private';

create index if not exists profiles_consent_status_idx
  on public.profiles (consent_status) where consent_status = 'pending';

-- ---------------------------------------------------------------------------
-- The rule, in one place
-- ---------------------------------------------------------------------------

create or replace function public.consent_required_for_birth_year(p_birth_year integer)
returns boolean
language sql
-- STABLE, not IMMUTABLE: it reads current_date. Marking a function immutable
-- when it depends on the clock lets the planner fold it to a constant and
-- cache the result, which for an age test means it would eventually be wrong
-- in whichever direction hurts.
stable
set search_path = public
as $$
  -- Unknown birth year: no consent requirement. Every account created
  -- before this migration has a null here, and locking out the entire
  -- existing user base on a column they were never asked for would be a
  -- worse failure than the one this migration fixes. Signup collects it from
  -- now on; existing users are prompted on next profile save.
  select p_birth_year is not null
     and (extract(year from current_date)::int - p_birth_year) <= 13;
$$;

revoke all on function public.consent_required_for_birth_year(integer) from public, anon;
grant execute on function public.consent_required_for_birth_year(integer) to authenticated;

-- ---------------------------------------------------------------------------
-- The client cannot set its own consent state — 022's trigger, extended
-- ---------------------------------------------------------------------------
-- consent_status is derived, never accepted. The client sends a birth year;
-- the database decides what that means. And birth_year is WRITE-ONCE from
-- the client, which is the whole load-bearing part: if a pending 12-year-old
-- could edit their birth year to 2005, the recompute below would hand them
-- 'not_required' and the gate would be a formality. Changing it afterwards
-- is a support action (service role), like changing a tier.

create or replace function public.protect_privileged_profile_columns()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if current_user in ('service_role', 'postgres', 'supabase_admin') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.subscription_tier      := 'free';
    new.whop_membership_id     := null;
    new.stripe_customer_id     := null;
    new.stripe_subscription_id := null;
    -- Derived from the birth year, never taken from the request body.
    new.consent_status :=
      case when public.consent_required_for_birth_year(new.birth_year)
           then 'pending' else 'not_required' end;
    new.consent_granted_at := null;
    new.consent_granted_by := null;
    return new;
  end if;

  if new.subscription_tier      is distinct from old.subscription_tier
  or new.whop_membership_id     is distinct from old.whop_membership_id
  or new.stripe_customer_id     is distinct from old.stripe_customer_id
  or new.stripe_subscription_id is distinct from old.stripe_subscription_id
  or new.role                   is distinct from old.role
  or new.family_code            is distinct from old.family_code
  then
    raise exception 'This profile field can only be changed by Seeded.'
      using errcode = '42501';
  end if;

  -- Write-once. A null birth_year may be filled in (every pre-030 account
  -- has one); a stored one may not be edited.
  if old.birth_year is not null and new.birth_year is distinct from old.birth_year then
    raise exception 'Date of birth can only be changed by Seeded. Contact support.'
      using errcode = '42501';
  end if;

  if old.birth_year is null and new.birth_year is not null then
    -- First time it is known: apply the rule.
    new.consent_status :=
      case when public.consent_required_for_birth_year(new.birth_year)
           then 'pending' else 'not_required' end;
    new.consent_granted_at := null;
    new.consent_granted_by := null;
  else
    -- Any other update leaves the consent state exactly as the database has
    -- it. The client cannot move it in either direction.
    new.consent_status     := old.consent_status;
    new.consent_granted_at := old.consent_granted_at;
    new.consent_granted_by := old.consent_granted_by;
  end if;

  return new;
end;
$$;

revoke all on function public.protect_privileged_profile_columns() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- The gate: a pending account reads and writes nothing
-- ---------------------------------------------------------------------------
-- This is RLS, not an AuthGate. CLAUDE.md: "Never replace RLS with a
-- client-side check — AuthGate/PaidGate are cosmetic."
--
-- Implemented as one RESTRICTIVE policy per table rather than by editing the
-- ~70 existing permissive policies. Restrictive policies AND with the
-- permissive ones, so each table keeps exactly the access rules it had, plus
-- this one extra condition. Nothing already written has to be re-reasoned
-- about, and removing the gate is dropping 19 policies rather than restoring
-- 70.

create or replace function public.account_active()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  -- NOT "has a profile with consent granted". No profile row at all means
  -- signup is still in flight (lib/auth.ts creates the auth user, then the
  -- profile), and failing closed there would make it impossible to create
  -- any account. The only state that blocks is an explicit 'pending'.
  select not exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.consent_status = 'pending'
  );
$$;

-- Required: Postgres checks EXECUTE on a function used inside an RLS policy
-- against the querying role. Verified the hard way in 027 — see that file.
revoke all on function public.account_active() from public, anon;
grant execute on function public.account_active() to authenticated;

do $$
declare
  t text;
  gated constant text[] := array[
    'utr_entries', 'matches', 'coach_outreach', 'tournament_entries',
    'daily_checkins', 'cost_calculations', 'recruiting_checklist_items',
    'user_settings', 'training_plans', 'workout_sessions', 'exercises',
    'session_exercises', 'saved_templates', 'encouragement_notes',
    'parent_reports', 'season_budgets', 'budget_expenses', 'family_codes',
    'parent_accounts', 'families'
  ];
begin
  foreach t in array gated loop
    execute format('drop policy if exists account_active_required on public.%I', t);
    -- (select ...) so the function is evaluated once per statement rather
    -- than once per row — the same form the repo's other policies use for
    -- auth.uid(), and what the performance advisor asks for.
    execute format($f$
      create policy account_active_required on public.%I
        as restrictive for all to authenticated
        using ((select public.account_active()))
        with check ((select public.account_active()))
    $f$, t);
  end loop;
end $$;

-- `profiles` gets the same gate with one carve-out: the caller's OWN row.
-- A pending account has to be able to read itself (to know it is pending and
-- show the waiting screen), fill in a missing birth year, and delete itself.
-- It still sees no other profile — including the family it is waiting on.
drop policy if exists account_active_required on public.profiles;
create policy account_active_required on public.profiles
  as restrictive for all to authenticated
  using ((select public.account_active()) or id = (select auth.uid()))
  with check ((select public.account_active()) or id = (select auth.uid()));

-- `family_join_attempts` and `rate_limit_events` are deliberately NOT gated:
-- they have no policies at all, so `authenticated` already cannot touch
-- them, and the SECURITY DEFINER functions that do must keep working for a
-- pending account (it still needs to be rate-limited, and still needs to be
-- able to enter a family code). `badges` and `friendships` were locked in
-- 027 and have no policies either.

-- ---------------------------------------------------------------------------
-- Recording consent
-- ---------------------------------------------------------------------------

create or replace function public.my_consent_state()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_status text;
  v_birth_year int;
begin
  if v_user is null then
    raise exception 'Sign in first.' using errcode = '28000';
  end if;

  select consent_status, birth_year into v_status, v_birth_year
  from public.profiles where id = v_user;

  if v_status is null then
    return jsonb_build_object('status', 'unknown', 'birth_year_known', false);
  end if;

  return jsonb_build_object(
    'status', v_status,
    'birth_year_known', v_birth_year is not null
  );
end;
$$;

revoke all on function public.my_consent_state() from public, anon;
grant execute on function public.my_consent_state() to authenticated;

-- grant_parent_consent(child)
--
-- Who may call it: an account that is itself active, has role 'parent' on
-- its own profile, and is an APPROVED member of the same family as the
-- child. "Approved member" is is_family_member(), the same predicate every
-- family read goes through since 023 §8 — so this cannot be reached by
-- someone holding a guessed code.
--
-- Why role='parent' and not "any approved member": consent is a statement
-- only an adult can make. Seeded cannot verify adulthood, but it can at
-- least refuse to let one minor consent on behalf of another, which is what
-- "any approved member" would have allowed in a family of two siblings.

create or replace function public.grant_parent_consent(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_my_role text;
  v_my_status text;
  v_child_code text;
  v_updated int;
begin
  if v_user is null then
    raise exception 'Sign in first.' using errcode = '28000';
  end if;

  if p_user_id = v_user then
    return jsonb_build_object('status', 'not_allowed', 'reason', 'self');
  end if;

  select role, consent_status into v_my_role, v_my_status
  from public.profiles where id = v_user;

  if v_my_status = 'pending' then
    return jsonb_build_object('status', 'not_allowed', 'reason', 'own_account_pending');
  end if;

  if v_my_role is distinct from 'parent' then
    return jsonb_build_object('status', 'not_allowed', 'reason', 'not_a_parent_account');
  end if;

  -- The child's family: whichever of the two shapes holds it.
  select coalesce(
    (select family_code from public.profiles where id = p_user_id),
    (select family_code from public.parent_accounts
      where user_id = p_user_id and status = 'approved' limit 1)
  ) into v_child_code;

  if v_child_code is null or not public.is_family_member(v_child_code) then
    return jsonb_build_object('status', 'not_allowed', 'reason', 'not_your_family');
  end if;

  update public.profiles
  set consent_status = 'granted',
      consent_granted_at = now(),
      consent_granted_by = v_user
  where id = p_user_id and consent_status = 'pending';

  get diagnostics v_updated = row_count;
  if v_updated = 0 then
    return jsonb_build_object('status', 'nothing_pending');
  end if;

  return jsonb_build_object('status', 'granted');
end;
$$;

revoke all on function public.grant_parent_consent(uuid) from public, anon;
grant execute on function public.grant_parent_consent(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- One approval, two records
-- ---------------------------------------------------------------------------
-- An under-13 signs up by entering a parent's family code (the app gives
-- them no "create a family" option — see components/auth/signup-flow.tsx).
-- That leaves them with a pending family link AND a pending consent, both
-- waiting on the same adult.
--
-- Making them two separate taps on two separate cards would be worse in
-- every way: the parent would approve a join, nothing would change for the
-- child, and they would have to find a second screen. So approve_family_join
-- records consent in the same statement when the joiner is pending and the
-- approver is a parent account. The card that calls it says, in those words,
-- what is being consented to and that Seeded cannot verify adulthood.
--
-- If the approver is NOT a parent account (a sibling player approving), the
-- join is approved and the consent is left pending — the child stays locked
-- until an adult in the family records it, via grant_parent_consent(). That
-- is the honest outcome rather than a quiet promotion.

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
  v_consent text := null;
begin
  if v_user is null then
    raise exception 'Sign in first.' using errcode = '28000';
  end if;

  -- 026 widened this from "the player only" to "any approved member", via
  -- my_family_code() + is_family_member(). Unchanged here.
  v_code := public.my_family_code();
  if v_code is null or not public.is_family_member(v_code) then
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
      -- Approved into the family, still waiting on an adult.
      v_consent := 'still_pending';
    end if;
  end if;

  return jsonb_build_object('status', 'approved', 'consent', v_consent);
end;
$$;

revoke all on function public.approve_family_join(uuid) from public, anon;
grant execute on function public.approve_family_join(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Verification (staging, with throwaway fixtures)
-- ---------------------------------------------------------------------------
--   * under-13 signup lands consent_status='pending' even when the insert
--     body says 'granted'
--   * pending account: select from utr_entries / matches / families /
--     parent_accounts -> 0 rows; insert -> 42501; own profile -> 1 row
--   * pending account cannot edit its own birth_year -> 42501
--   * parent approves the join -> consent 'granted', child reads and writes
--   * a player (not a parent) approving leaves consent 'still_pending'
--   * a stranger calling grant_parent_consent -> not_your_family
--   * a pending child calling grant_parent_consent -> own_account_pending
--
-- ROLLBACK: docs/HANDOFF.md §J step 8.
