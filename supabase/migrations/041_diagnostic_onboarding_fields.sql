-- 041_diagnostic_onboarding_fields.sql
--
-- STATUS: written 2026-11-18 for PR B (diagnostic onboarding, B1/B3).
-- Applied and probed on STAGING (gnlcpnsweqbtwpaqhqqg) only. Production
-- gets it later, on Niran's go, per docs/archive/GO-SEQUENCE.md §3 and
-- docs/HANDOFF.md §J Step 16. Needs 035 (profile_row_exists()) and is
-- otherwise independent of 042/043.
--
-- ===========================================================================
-- Why
-- ===========================================================================
-- The new onboarding asks two things the profile cannot hold today:
--
--   * birth MONTH. With birth_year alone the age a player will be at a given
--     enrollment date is off by up to a year, which is the difference between
--     "a junior" and "a senior" in the recruiting calendar. Month + year only,
--     never a day: a day adds nothing the product uses and makes the row a
--     date of birth, which is exactly the kind of field data minimisation
--     says not to collect.
--   * enrollment TERM: does the player plan to start college in the fall
--     after graduating, the spring after, or are they not sure.
--
-- ===========================================================================
-- What
-- ===========================================================================
--   1. profiles.birth_month smallint null, 1..12.
--   2. profiles.enrollment_term text null, one of
--      'fall_after_grad' | 'spring_after_grad' | 'not_sure'.
--   3. protect_privileged_profile_columns() — 035's version VERBATIM plus ONE
--      new block: birth_month is write-once from the client, exactly like
--      birth_year (null -> value allowed once; value -> anything else is
--      42501). Same message as birth_year, because to the person it is the
--      same field ("date of birth"). Nothing else in the function changes:
--      the 032 takeover check, the 033 birth-year requirement, the INSERT
--      scrub of the billing columns, the consent derivation and the
--      privileged-column list are all as 035 left them.
--
--      birth_month does NOT feed consent. consent_required_for_birth_year()
--      is `<= 13` on the year alone, which over-includes 13-year-olds; that
--      is the safe direction and a month cannot make it safer.
--
--   enrollment_term is an ordinary client-writable column. It is not in the
--   trigger at all.
--
--   No RLS change: both columns live on `profiles`, which every client can
--   read and write for its OWN row only (027/037), and `select *` in the
--   account export already includes them.
--
-- ===========================================================================
-- Verify (as a real user: `set local role authenticated` + jwt claims — the
-- SQL editor's `postgres` bypasses both RLS and this trigger)
-- ===========================================================================
--   begin;
--   set local role authenticated;
--   select set_config('request.jwt.claims', '{"sub":"<uid>","role":"authenticated"}', true);
--   update public.profiles set birth_month = 5  where id = '<uid>';   -- ok (null -> 5)
--   update public.profiles set birth_month = 5  where id = '<uid>';   -- ok (unchanged)
--   update public.profiles set birth_month = 6  where id = '<uid>';   -- 42501
--   update public.profiles set birth_month = null where id = '<uid>'; -- 42501
--   update public.profiles set enrollment_term = 'not_sure' where id = '<uid>';  -- ok
--   update public.profiles set enrollment_term = 'winter' where id = '<uid>';    -- 23514
--   rollback;
--   -- and as postgres (no role switch): birth_month 13 -> 23514.
--
-- ===========================================================================
-- Rollback (runnable; restores 035's function verbatim, then drops the
-- columns — which DELETES whatever months/terms were collected)
-- ===========================================================================
--   begin;
--   -- 1. Re-run the `create or replace function
--   --    public.protect_privileged_profile_columns()` block from
--   --    035_fix_upsert_writes_and_deletion.sql verbatim (grants are kept by
--   --    `create or replace`; the revoke below re-asserts them anyway).
--   --    It is also reproduced in docs/HANDOFF.md §J Step 16.
--   -- 2. Then:
--   alter table public.profiles drop constraint if exists profiles_enrollment_term_check;
--   alter table public.profiles drop constraint if exists profiles_birth_month_check;
--   alter table public.profiles drop column if exists enrollment_term;
--   alter table public.profiles drop column if exists birth_month;
--   revoke all on function public.protect_privileged_profile_columns() from public, anon, authenticated;
--   commit;
--   Order matters: restore the function FIRST. 041's function references
--   old.birth_month, so dropping the column while it is installed makes
--   every profile UPDATE fail with 42703.

alter table public.profiles add column if not exists birth_month smallint;
alter table public.profiles add column if not exists enrollment_term text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_birth_month_check' and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_birth_month_check
      check (birth_month is null or birth_month between 1 and 12);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_enrollment_term_check' and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_enrollment_term_check
      check (enrollment_term is null
             or enrollment_term in ('fall_after_grad', 'spring_after_grad', 'not_sure'));
  end if;
end
$$;

comment on column public.profiles.birth_month is
  'Month of birth, 1-12. Month + year only, never a day (data minimisation). Write-once from the client, like birth_year (041).';
comment on column public.profiles.enrollment_term is
  'When the player plans to enroll: fall_after_grad | spring_after_grad | not_sure. Client-writable (041).';

create or replace function public.protect_privileged_profile_columns()
returns trigger
language plpgsql
security invoker
set search_path = public
as $fn$
declare
  v_is_new_account boolean;
begin
  if current_user in ('service_role', 'postgres', 'supabase_admin') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- An upsert's INSERT branch runs even when the row exists. Only a row
    -- that does NOT exist yet is an account being created.
    v_is_new_account := not public.profile_row_exists(new.id);

    if v_is_new_account then
      -- 032: a family_code may only be claimed if nobody holds it yet.
      if new.family_code is not null and public.family_code_is_taken(new.family_code) then
        raise exception
          'Use the join code to request access to an existing family; it cannot be set on a profile directly.'
          using errcode = '42501';
      end if;

      -- 033: the under-13 gate cannot be skipped by omitting the field.
      if new.birth_year is null then
        raise exception 'A birth year is required to create an account.'
          using errcode = '23502';
      end if;
    end if;

    -- Always scrubbed, new row or not: these are never the client's to set.
    new.subscription_tier      := 'free';
    new.whop_membership_id     := null;
    new.stripe_customer_id     := null;
    new.stripe_subscription_id := null;

    if v_is_new_account then
      new.consent_status :=
        case when public.consent_required_for_birth_year(new.birth_year)
             then 'pending' else 'not_required' end;
      new.consent_granted_at := null;
      new.consent_granted_by := null;
    end if;
    -- When the row already exists the consent columns are left as the
    -- payload had them and never read here; see 035 for why that is safe
    -- (DO UPDATE SET only assigns payload columns, and the UPDATE branch
    -- below forces consent from OLD).

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

  if old.birth_year is not null and new.birth_year is distinct from old.birth_year then
    raise exception 'Date of birth can only be changed by Seeded. Contact support.'
      using errcode = '42501';
  end if;

  -- 041: birth_month is write-once, like birth_year. A null may be filled in
  -- once (onboarding, or an account that predates 041); after that only
  -- Seeded can change it. Re-sending the same value is not a change.
  if old.birth_month is not null and new.birth_month is distinct from old.birth_month then
    raise exception 'Date of birth can only be changed by Seeded. Contact support.'
      using errcode = '42501';
  end if;

  if old.birth_year is null and new.birth_year is not null then
    new.consent_status :=
      case when public.consent_required_for_birth_year(new.birth_year)
           then 'pending' else 'not_required' end;
    new.consent_granted_at := null;
    new.consent_granted_by := null;
  else
    new.consent_status     := old.consent_status;
    new.consent_granted_at := old.consent_granted_at;
    new.consent_granted_by := old.consent_granted_by;
  end if;

  return new;
end;
$fn$;
revoke all on function public.protect_privileged_profile_columns() from public, anon, authenticated;
