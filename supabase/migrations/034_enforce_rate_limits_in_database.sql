-- 034_enforce_rate_limits_in_database.sql  —  closes S-21
--
-- STATUS: APPLIED TO STAGING 2026-11-15. NOT APPLIED TO PRODUCTION.
--
-- THE GAP. Migration 028 put the rate-limit counter in Postgres so it would
-- survive multiple serverless instances — correct, and still only half the
-- job. The limit was CONSUMED by `lib/rate-limit.ts`, i.e. by our own API
-- routes. But `authenticated` holds table-level INSERT/UPDATE/DELETE, so a
-- client with the same bearer token can POST straight to
-- `/rest/v1/utr_entries` and never touch a route. Every limit was advisory.
-- 024's comment already conceded this for `profiles`; it was true of every
-- table.
--
-- THE FIX. A BEFORE INSERT OR UPDATE OR DELETE trigger on every table a
-- client can write. It runs no matter how the write arrives — through our
-- route, through PostgREST, through a future endpoint nobody has written
-- yet. That is the property worth having: the limit is a property of the
-- TABLE, not of the path taken to it.
--
-- WHY A TRIGGER AND NOT RPC-ONLY WRITES. Revoking table grants and routing
-- every write through a SECURITY DEFINER function would also work and is
-- arguably tidier, but it means rewriting all of lib/db/* and losing
-- PostgREST's filtering for reads-with-writes. A trigger gets the same
-- enforcement for a fraction of the blast radius.
--
-- WHY THE ROUTES NO LONGER CONSUME. If both the route and the trigger
-- consumed, every API write would count twice and halve the real limit.
-- So the trigger is now the only counter, and the routes use `peek_rate_limit`
-- — same policy, counts nothing — purely so a user gets a friendly 429
-- before the work is attempted rather than a raw database error after. The
-- enforcement is the trigger; the peek is manners.

-- ---------------------------------------------------------------------------
-- 1. peek: the same answer, without spending anything
-- ---------------------------------------------------------------------------

create or replace function public.peek_rate_limit(p_bucket text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_limit int;
  v_window int := 3600;
  v_used int;
  v_oldest timestamptz;
begin
  if v_user is null then
    raise exception 'Sign in first.' using errcode = '28000';
  end if;

  v_limit := public.rate_limit_for_bucket(p_bucket);
  if v_limit is null then
    return jsonb_build_object('allowed', false, 'retry_after_seconds', v_window,
                              'reason', 'unknown_bucket');
  end if;

  select count(*), min(created_at) into v_used, v_oldest
  from public.rate_limit_events
  where user_id = v_user and bucket = p_bucket
    and created_at > now() - make_interval(secs => v_window);

  if v_used >= v_limit then
    return jsonb_build_object(
      'allowed', false,
      'retry_after_seconds',
        greatest(1, ceil(extract(epoch from (v_oldest + make_interval(secs => v_window) - now())))::int),
      'limit', v_limit
    );
  end if;
  return jsonb_build_object('allowed', true, 'remaining', v_limit - v_used);
end;
$$;

revoke all on function public.peek_rate_limit(text) from public, anon;
grant execute on function public.peek_rate_limit(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. The policy, in one place both the peek and the trigger read
-- ---------------------------------------------------------------------------
-- 028 inlined this CASE inside consume_rate_limit. With three callers it has
-- to be a function, or the three drift.

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
    when 'training_write'    then 120
    when 'account_deletion'  then 5
    when 'data_export'       then 3
    when 'whop_checkout'     then 20
    -- Buckets the trigger assigns for tables with no route of their own.
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

-- ---------------------------------------------------------------------------
-- 3. The enforcing trigger
-- ---------------------------------------------------------------------------
-- SECURITY DEFINER so it can write rate_limit_events, which `authenticated`
-- deliberately cannot touch (028). It still reads auth.uid(), so it limits
-- the CALLER, not the owner.

create or replace function public.enforce_write_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_bucket text;
  v_limit int;
  v_used int;
  v_oldest timestamptz;
  v_window constant int := 3600;
begin
  -- NOT `current_user`. This function is SECURITY DEFINER (it must be, to
  -- write rate_limit_events, which `authenticated` cannot touch), and
  -- SECURITY DEFINER sets current_user to the function OWNER — postgres. So
  -- a `current_user in ('postgres', ...)` exemption matches EVERY caller and
  -- the trigger silently limits nobody.
  --
  -- Caught by the attack test on the first run: all 25 direct writes
  -- succeeded. It is the mirror image of the trap recorded in 032, where an
  -- inline `exists(...)` inside a SECURITY INVOKER trigger was filtered by
  -- RLS. Same lesson from the other side: know which user a function thinks
  -- it is.
  --
  -- The JWT role claim is the caller's actual role. The service role (Whop
  -- webhook, support tooling) is exempt; a SQL-editor session has no claims
  -- at all and falls through to the auth.uid() check below.
  if coalesce(current_setting('request.jwt.claims', true)::json->>'role', '') = 'service_role' then
    return coalesce(new, old);
  end if;

  -- No session means RLS will refuse this anyway; counting it would let an
  -- unauthenticated caller fill another user's bucket.
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

  -- A table that gets this trigger without a bucket is a mistake, and it
  -- should be a loud one rather than an unlimited table.
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
$$;

revoke all on function public.enforce_write_rate_limit() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Attach it to every table a client can write
-- ---------------------------------------------------------------------------
-- Derived from the table list above rather than from pg_policies, because a
-- table with no write policy today may get one tomorrow and should already
-- be limited when it does.

do $$
declare
  t text;
  targets constant text[] := array[
    'profiles', 'utr_entries', 'matches', 'coach_outreach', 'season_budgets',
    'budget_expenses', 'training_plans', 'workout_sessions', 'exercises',
    'session_exercises', 'saved_templates', 'daily_checkins',
    'tournament_entries', 'cost_calculations', 'recruiting_checklist_items',
    'user_settings', 'families', 'family_codes', 'encouragement_notes',
    'parent_reports'
  ];
begin
  foreach t in array targets loop
    execute format('drop trigger if exists %I on public.%I',
                   'zz_rate_limit_' || t, t);
    -- `zz_` prefix: triggers fire in name order, and this must run AFTER the
    -- column-protection trigger on profiles. A request that is going to be
    -- rejected as a privilege violation should not also spend the caller's
    -- rate-limit budget.
    execute format(
      'create trigger %I before insert or update or delete on public.%I
         for each row execute function public.enforce_write_rate_limit()',
      'zz_rate_limit_' || t, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Verification (staging, as a test user, not as postgres)
-- ---------------------------------------------------------------------------
--   -- direct PostgREST-style write, no API route involved:
--   insert into public.utr_entries (user_id, utr, recorded_at) ... x21
--   -> the 21st raises 53400
--   -- and a different user is unaffected
--   -- and the service role is never limited
--
-- ROLLBACK: docs/HANDOFF.md §J step 11.
