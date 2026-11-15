-- 035_fix_upsert_writes_and_deletion.sql
--
-- STATUS: APPLIED TO STAGING 2026-11-15. NOT APPLIED TO PRODUCTION.
--
-- Three bugs that 032, 033 and 034 introduced, all found by an independent
-- review on 2026-11-15 and then reproduced against staging. Two of them
-- would have taken the product down the moment the rollout finished.
--
-- =========================================================================
-- 1. CRITICAL — 032 and 033 broke every profile write in the app
-- =========================================================================
-- `writeCurrentPlayerProfile()` (lib/auth.ts) saves with supabase-js
-- `.upsert()`, which compiles to `INSERT ... ON CONFLICT (id) DO UPDATE`.
-- **PostgreSQL fires BEFORE INSERT row triggers for every row of such a
-- statement, before it detects the conflict.** So the INSERT branch of
-- protect_privileged_profile_columns() runs on ordinary profile UPDATES
-- too — where `birth_year` is absent from the payload (the Player type has
-- no birth-year field at all) and `family_code` is the user's own.
--
-- Reproduced on staging, as the signed-in user, on a row that already
-- exists:
--   insert into profiles (id, name, ...) values (...)
--     on conflict (id) do update set name = excluded.name;
--   -> ERROR 23502: A birth year is required to create an account.   (033)
--   -> ERROR 42501: Use the join code to request access ...          (032)
--
-- app/api/profile/route.ts calls this "the single highest-traffic write
-- path in the app". Renaming yourself in Settings, finishing onboarding,
-- saving a target school, logging a UTR check-in and requesting deletion
-- would all have failed, surfacing "A birth year is required to create an
-- account" to someone editing their name.
--
-- THE FIX. Both checks are about CREATING an account, so they only apply
-- when there is genuinely no row yet. An UPDATE that arrives through the
-- INSERT branch is still fully protected: the UPDATE branch below rejects
-- any change to role, family_code, tier or the billing ids, and birth_year
-- stays write-once.
--
-- WHY A SECURITY DEFINER HELPER rather than an inline `exists`. This
-- trigger is SECURITY INVOKER, so an inline subquery is filtered by RLS —
-- the exact trap 032 recorded from the other direction. The caller can see
-- their own profile row today, but that depends on a policy continuing to
-- exist, and a rollback that drops it would silently turn every update back
-- into an "account creation". The helper does not depend on policy.

create or replace function public.profile_row_exists(p_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.profiles p where p.id = p_id);
$$;
revoke all on function public.profile_row_exists(uuid) from public, anon;
grant execute on function public.profile_row_exists(uuid) to authenticated;
comment on function public.profile_row_exists(uuid) is
  'True when a profile row already exists for this id. SECURITY DEFINER so the INSERT-branch guard in protect_privileged_profile_columns() can tell a real account creation from the INSERT half of an upsert without depending on RLS. Returns a boolean only.';

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
    -- NOTE: when the row already exists, the consent columns are left
    -- exactly as the payload had them and are NEVER read here.
    --
    -- An earlier draft did `select ... into new.consent_status ... from
    -- profiles where id = new.id`, which a verification pass flagged: this
    -- trigger is SECURITY INVOKER, so that read is RLS-filtered, and
    -- `SELECT INTO` with no rows sets its targets to NULL *silently* while
    -- consent_status is NOT NULL. Routing it through a SECURITY DEFINER
    -- helper then failed for a different reason — the trigger runs as
    -- `authenticated`, so the helper would have to be executable by every
    -- signed-in user, turning it into a consent-status oracle for any uuid.
    --
    -- Neither is necessary. For an upsert, `DO UPDATE SET` only assigns the
    -- columns in the payload, and consent_status is not one of them — so
    -- whatever this branch leaves in `excluded` never reaches the stored
    -- row. The BEFORE UPDATE branch below then forces consent from `old`,
    -- which is the authoritative value. For a plain INSERT onto an existing
    -- id, the statement fails with 23505 regardless.
    --
    -- The shortest correct code here is no code.

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

-- =========================================================================
-- 2. CRITICAL — 034 broke delete_my_account(), which is all of P0-8
-- =========================================================================
-- 029's delete_my_account() is SECURITY DEFINER but still reads auth.uid(),
-- and the caller's JWT role is `authenticated`, not `service_role` — so
-- 034's service-role exemption does not apply to it. Every row the deletion
-- cascades through hits the per-row rate-limit trigger.
--
-- The predicted failure was a 53400 after 20 cascaded utr_entries. The
-- ACTUAL failure, reproduced on staging, is worse and hits EVERY user
-- regardless of how much data they have:
--
--   ERROR 23503: insert or update on table "rate_limit_events" violates
--   foreign key constraint "rate_limit_events_user_id_fkey"
--   DETAIL: Key (user_id)=(...) is not present in table "users".
--   CONTEXT: ... delete from auth.users where id=v_user
--
-- As the cascade removes auth.users, the trigger tries to log a rate-limit
-- event for a user that no longer exists. **Account deletion was broken for
-- everyone** — the mechanism the privacy policy promises, and the one thing
-- a parent is most likely to use.
--
-- THE FIX. A transaction-local marker that delete_my_account() sets and the
-- trigger honours. A client cannot set a GUC through PostgREST, and
-- `set_config(..., true)` is scoped to the transaction, so this cannot be
-- used to escape the limiter from the outside.

create or replace function public.enforce_write_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_user uuid := auth.uid();
  v_bucket text;
  v_limit int;
  v_used int;
  v_oldest timestamptz;
  v_window constant int := 3600;
begin
  -- A deliberate, bounded, transaction-scoped bulk delete of the caller's
  -- OWN data. Only delete_my_account() sets this, and only for the duration
  -- of its own transaction; PostgREST gives a client no way to set it.
  -- Without this the cascade from auth.users dies on a foreign key.
  if coalesce(current_setting('seeded.bypass_rate_limit', true), '') = 'on' then
    return coalesce(new, old);
  end if;

  -- NOT `current_user`: SECURITY DEFINER makes that the function OWNER, so
  -- a current_user check matches every caller (see 034's note).
  if coalesce(current_setting('request.jwt.claims', true)::json->>'role', '') = 'service_role' then
    return coalesce(new, old);
  end if;

  if v_user is null then
    return coalesce(new, old);
  end if;

  v_bucket := case tg_table_name
    when 'profiles'                   then 'profile_write'
    when 'utr_entries'                then 'utr_entry'
    when 'matches'                    then 'match_write'
    when 'coach_outreach'             then 'outreach_write'
    when 'season_budgets'             then 'budget_write'
    when 'budget_expenses'            then 'budget_write'
    when 'training_plans'             then 'training_write'
    when 'workout_sessions'           then 'training_write'
    when 'exercises'                  then 'training_write'
    when 'session_exercises'          then 'training_write'
    when 'saved_templates'            then 'training_write'
    when 'daily_checkins'             then 'checkin_write'
    when 'tournament_entries'         then 'tournament_write'
    when 'cost_calculations'          then 'tournament_write'
    when 'recruiting_checklist_items' then 'checklist_write'
    when 'user_settings'              then 'settings_write'
    when 'families'                   then 'family_write'
    when 'family_codes'               then 'family_write'
    when 'encouragement_notes'        then 'note_write'
    when 'parent_reports'             then 'note_write'
    else null
  end;

  if v_bucket is null then
    raise exception 'No rate-limit bucket defined for table %', tg_table_name
      using errcode = '53400';
  end if;

  v_limit := public.rate_limit_for_bucket(v_bucket);

  select count(*), min(created_at) into v_used, v_oldest
  from public.rate_limit_events
  where user_id = v_user and bucket = v_bucket
    and created_at > now() - make_interval(secs => v_window);

  if v_used >= v_limit then
    raise exception 'Too many changes at once. Try again later.'
      using errcode = '53400',
            hint = format('retry_after_seconds=%s',
              greatest(1, ceil(extract(epoch from (v_oldest + make_interval(secs => v_window) - now())))::int));
  end if;

  insert into public.rate_limit_events (user_id, bucket) values (v_user, v_bucket);
  return coalesce(new, old);
end;
$fn$;
revoke all on function public.enforce_write_rate_limit() from public, anon, authenticated;

create or replace function public.delete_my_account()
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_user uuid := auth.uid();
  v_code text;
  v_remaining int;
  v_family_deleted boolean := false;
begin
  if v_user is null then
    raise exception 'Sign in first.' using errcode = '28000';
  end if;

  -- Transaction-scoped. See enforce_write_rate_limit(): without this the
  -- cascade from auth.users fails on rate_limit_events' foreign key.
  perform set_config('seeded.bypass_rate_limit', 'on', true);

  select family_code into v_code from public.profiles where id = v_user;
  if v_code is not null then
    update public.profiles set family_code = null where id = v_user;
  end if;

  if v_code is not null then
    select count(*) into v_remaining
    from (
      select id as member from public.profiles
        where family_code = v_code and id <> v_user
      union
      select user_id as member from public.parent_accounts
        where family_code = v_code and user_id <> v_user
    ) remaining_members;

    if v_remaining = 0 then
      delete from public.budget_expenses where family_code = v_code;
      delete from public.season_budgets  where family_code = v_code;
      delete from public.families where code = v_code;
      v_family_deleted := true;
    end if;
  end if;

  delete from auth.users where id = v_user;

  return jsonb_build_object('status', 'deleted', 'family_deleted', v_family_deleted);
end;
$fn$;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

-- =========================================================================
-- 3. HIGH — the training bucket was far below one ordinary save
-- =========================================================================
-- lib/db/events.ts re-upserts EVERY training_plans and workout_sessions row
-- on each save, and the calendar persists on every add/move/edit/delete/
-- undo. A 12-week plan at 4 sessions a week is ~48 rows per save against a
-- shared limit of 120 — two or three saves before the next edit is refused.
-- On /events the write is `void save(...).catch(() => undefined)`, so the
-- edit would appear to apply and never reach the database: silent data loss.
--
-- The limiter is there to stop abuse, not ordinary use. 2000 rows an hour is
-- still a ceiling (roughly 40 full-plan saves) and is nowhere near what a
-- person editing a calendar produces.
--
-- The swallowed error is an app-side bug and is fixed separately; the limit
-- being below one save is the part that belongs in SQL.

create or replace function public.rate_limit_for_bucket(p_bucket text)
returns int
language sql
immutable
set search_path = public
as $$
  select case p_bucket
    when 'profile_write'     then 60
    when 'utr_entry'         then 20
    when 'match_write'       then 60
    when 'outreach_write'    then 40
    when 'budget_write'      then 60
    -- Bulk: one calendar save rewrites the whole plan, row by row.
    when 'training_write'    then 2000
    when 'account_deletion'  then 5
    when 'data_export'       then 3
    when 'whop_checkout'     then 20
    when 'checkin_write'     then 60
    when 'tournament_write'  then 60
    when 'checklist_write'   then 120
    when 'settings_write'    then 60
    when 'family_write'      then 30
    when 'note_write'        then 30
    else null
  end;
$$;
revoke all on function public.rate_limit_for_bucket(text) from public, anon;
grant execute on function public.rate_limit_for_bucket(text) to authenticated;

-- =========================================================================
-- 4. 034's comment claimed consume_rate_limit reads the shared policy. It
--    did not — 028's inlined CASE was still a second, unguarded copy, and
--    §J's rollback tells the operator to revert the code onto it.
-- =========================================================================

create or replace function public.consume_rate_limit(p_bucket text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_user uuid := auth.uid();
  v_limit int;
  v_window constant int := 3600;
  v_used int;
  v_oldest timestamptz;
begin
  if v_user is null then
    raise exception 'Sign in first.' using errcode = '28000';
  end if;

  v_limit := public.rate_limit_for_bucket(p_bucket);
  if v_limit is null then
    return jsonb_build_object('allowed', false, 'retry_after_seconds', v_window,
                              'limit', 0, 'window_seconds', v_window,
                              'reason', 'unknown_bucket');
  end if;

  delete from public.rate_limit_events
  where user_id = v_user and created_at < now() - interval '1 day';

  select count(*), min(created_at) into v_used, v_oldest
  from public.rate_limit_events
  where user_id = v_user and bucket = p_bucket
    and created_at > now() - make_interval(secs => v_window);

  if v_used >= v_limit then
    return jsonb_build_object(
      'allowed', false,
      'retry_after_seconds',
        greatest(1, ceil(extract(epoch from (v_oldest + make_interval(secs => v_window) - now())))::int),
      'limit', v_limit, 'window_seconds', v_window);
  end if;

  insert into public.rate_limit_events (user_id, bucket) values (v_user, p_bucket);
  return jsonb_build_object('allowed', true, 'remaining', v_limit - v_used - 1);
end;
$fn$;
revoke all on function public.consume_rate_limit(text) from public, anon;
grant execute on function public.consume_rate_limit(text) to authenticated;

-- ROLLBACK: docs/HANDOFF.md §J step 12.
