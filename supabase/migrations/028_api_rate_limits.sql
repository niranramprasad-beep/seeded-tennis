-- 028_api_rate_limits.sql  —  S-6 (P1-SEC-3)
--
-- STATUS: APPLIED TO STAGING 2026-11-14. NOT APPLIED TO PRODUCTION.
--
-- THE GAP: no rate limiting on any API route. Every write route authenticates
-- and validates, and then accepts an unbounded number of calls. The two
-- limits that exist (join_family 5/hour, remind_family_approval 1/hour) are
-- in migrations 023 and 026 and are DB-side for a reason worth repeating
-- here, because it decides this migration's whole shape:
--
--   Vercel runs each route as a short-lived function and may run many
--   concurrently. An in-process counter (a Map in module scope) counts only
--   the requests that happened to land on one instance, so N instances
--   multiply every limit by N and a cold start resets it to zero. It looks
--   like a rate limiter in code review and is not one in production.
--
-- So the counter lives in Postgres, where every instance sees the same rows.
--
-- WHY THE LIMITS ARE NOT ARGUMENTS. The obvious signature,
-- consume_rate_limit(bucket, limit, window), is worthless: the caller is the
-- browser's own bearer token, so a user who wants no limit passes
-- limit => 1000000. The policy therefore lives inside the function, where
-- the client cannot reach it, and the RPC takes only a bucket name. An
-- unknown bucket is denied, not allowed — a typo'd bucket should fail
-- closed, loudly, in testing.
--
-- WHY IT RETURNS INSTEAD OF RAISING: the S-15 lesson. A function that logs
-- an attempt and then raises loses the log, because Postgres rolls the block
-- back to its savepoint and PostgREST wraps each RPC in its own transaction.
-- Everything here is an expected outcome, so everything returns a status.

create table if not exists public.rate_limit_events (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  bucket text not null,
  created_at timestamptz not null default now()
);

alter table public.rate_limit_events enable row level security;

-- Deliberately no policies: only the SECURITY DEFINER function below touches
-- this table. With RLS on and no policy, `authenticated` can neither read it
-- (which would reveal another user's activity pattern) nor write it (which
-- would let someone pad their own history or, worse, someone else's).
revoke all on table public.rate_limit_events from anon, authenticated;
revoke all on sequence public.rate_limit_events_id_seq from anon, authenticated;

create index if not exists rate_limit_events_lookup_idx
  on public.rate_limit_events (user_id, bucket, created_at desc);

-- ---------------------------------------------------------------------------
-- consume_rate_limit(bucket)
-- ---------------------------------------------------------------------------
-- One call = one attempt. Returns
--   {"allowed": true,  "remaining": n}
--   {"allowed": false, "retry_after_seconds": n, "limit": n, "window_seconds": n}
--
-- The attempt is recorded BEFORE the work it guards, and is recorded even
-- when the guarded work then fails. That is the intended behaviour for an
-- abuse control: a thousand failing writes are exactly the pattern worth
-- limiting, and a limiter that only counts successes can be driven forever
-- with malformed input.

create or replace function public.consume_rate_limit(p_bucket text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_limit int;
  v_window int;
  v_used int;
  v_oldest timestamptz;
begin
  if v_user is null then
    raise exception 'Sign in first.' using errcode = '28000';
  end if;

  -- The policy. Per hour, per user, per bucket. Sized from what a real
  -- person does in an hour of heavy use, with room to spare: these exist to
  -- stop scripted abuse, not to interrupt anybody's Sunday check-in.
  select l, w into v_limit, v_window from (
    select case p_bucket
      -- Profile and settings edits. /settings saves the whole profile on
      -- each field change, so this is the chattiest legitimate bucket.
      when 'profile_write'     then 60
      -- One UTR check-in a week is the product's own guidance.
      when 'utr_entry'         then 20
      when 'match_write'       then 60
      -- "Outreach send" = a stage change, a reminder, or a reply note. The
      -- email itself is a Gmail compose link, which never touches our API.
      when 'outreach_write'    then 40
      when 'budget_write'      then 60
      when 'training_write'    then 120
      -- Destructive and irreversible. A person does this once.
      when 'account_deletion'  then 5
      -- Reads every table the caller owns; the most expensive call we have.
      when 'data_export'       then 3
      when 'whop_checkout'     then 20
      else null
    end as l,
    3600 as w
  ) policy;

  -- Fail closed on an unknown bucket. A route that asks for a limit we
  -- never defined is a bug, and it should be impossible to ship it quietly.
  if v_limit is null then
    return jsonb_build_object(
      'allowed', false,
      'retry_after_seconds', v_window,
      'limit', 0,
      'window_seconds', v_window,
      'reason', 'unknown_bucket'
    );
  end if;

  -- Opportunistic cleanup, scoped to this caller's own rows so it can never
  -- lock a table other requests are using. Keeps the table proportional to
  -- live traffic without a cron job we would have to monitor.
  delete from public.rate_limit_events
  where user_id = v_user and created_at < now() - interval '1 day';

  select count(*), min(created_at) into v_used, v_oldest
  from public.rate_limit_events
  where user_id = v_user
    and bucket = p_bucket
    and created_at > now() - make_interval(secs => v_window);

  if v_used >= v_limit then
    return jsonb_build_object(
      'allowed', false,
      -- When the oldest attempt in the window ages out, one slot frees up.
      'retry_after_seconds',
        greatest(1, ceil(extract(epoch from (v_oldest + make_interval(secs => v_window) - now())))::int),
      'limit', v_limit,
      'window_seconds', v_window
    );
  end if;

  insert into public.rate_limit_events (user_id, bucket) values (v_user, p_bucket);

  return jsonb_build_object('allowed', true, 'remaining', v_limit - v_used - 1);
end;
$$;

revoke all on function public.consume_rate_limit(text) from public, anon;
grant execute on function public.consume_rate_limit(text) to authenticated;

-- ---------------------------------------------------------------------------
-- WHAT THIS MIGRATION CANNOT COVER
-- ---------------------------------------------------------------------------
-- Login, signup and password reset are NOT here, and cannot be. The browser
-- calls supabase.auth.* directly against the Supabase domain — those
-- requests never reach a Seeded route or Seeded middleware, so no code in
-- this repository is on that path. Their limiters are:
--   * Supabase Auth's own per-IP rate limits (Dashboard -> Authentication ->
--     Rate Limits), and
--   * leaked-password protection + a minimum password length, still off
--     (advisor WARN).
-- Both are project settings, not SQL, and are listed as Niran's items in
-- docs/MASTER_ROADMAP.md. Claiming "rate limits on login" while that is
-- untrue would be exactly the kind of statement P0-7 removed.
--
-- The Whop webhook is also deliberately unlimited: it is not a user, it is
-- signature-verified on raw bytes, and throttling it would drop legitimate
-- billing events during a burst.
--
-- ROLLBACK: docs/HANDOFF.md §J step 6.
