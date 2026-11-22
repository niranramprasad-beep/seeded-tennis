-- 043_parent_email_verification.sql
--
-- STATUS: written 2026-11-18 for PR B (B6). Applied and probed on STAGING
-- (gnlcpnsweqbtwpaqhqqg) only. Production gets it later, on Niran's go, per
-- docs/archive/GO-SEQUENCE.md §3 and docs/HANDOFF.md §J Step 18. Apply AFTER 041:
-- it replaces protect_privileged_profile_columns() again and keeps 041's
-- birth_month block.
--
-- REVISED 2026-11-18, before production, after a review broke the first
-- version on staging (see "THE GUARANTEE" below). This file is the fixed
-- version and is what production runs, once. Staging received the first
-- version and then the delta as `043b_fresh_email_verification`; both paths
-- end in the same schema.
--
-- ===========================================================================
-- Why
-- ===========================================================================
-- A parent account can approve people into a family and record PARENTAL
-- CONSENT for an under-13 (030/031). Nothing proves the person behind that
-- account owns the email address they typed. Production fact, measured
-- read-only: "Confirm email" is OFF in production Auth and new sign-ups get
-- `auth.users.email_confirmed_at` stamped AT SIGN-UP (auto-confirm). So
-- email_confirmed_at proves nothing and is NOT used here.
--
-- ===========================================================================
-- What
-- ===========================================================================
--   1. profiles.email_verified_at timestamptz null and
--      profiles.email_verified_for text null — PRIVILEGED. No client can set
--      or change either (the trigger scrubs them on INSERT and refuses any
--      change on UPDATE with 42501, exactly like subscription_tier).
--      _for records WHICH address was proven; verification only counts while
--      it equals the CURRENT auth email (email_is_verified, below).
--   1b. profiles.email_verify_requested_for text null and
--      profiles.email_verify_requested_at timestamptz null — PRIVILEGED the
--      same way. Written only by request_email_verification(): which address
--      a link was asked for, and when.
--   1c. public.auth_email_changes (user_id pk, changed_at) + an AFTER UPDATE
--      OF email trigger on auth.users that records the time of the LAST
--      email change. RLS on, no policies, no client grants: only
--      mark_email_verified() / request_email_verification() read it.
--   2. request_email_verification() — SECURITY DEFINER, granted to
--      authenticated. Spends one 'email_verify' (3/hour) and records
--      requested_for = the caller's CURRENT auth email, requested_at = now().
--      Refuses (returns, does not raise) when the email changed in the last
--      24 hours. The app calls it BEFORE signInWithOtp and sends the link to
--      the address it returns (lib/db/email-verification.ts).
--      mark_email_verified() — SECURITY DEFINER, granted to authenticated.
--      Stamps verified_at/verified_for for the CALLER only, and clears the
--      request, when ALL of these hold:
--        a. the JWT `amr` has an entry whose method is `otp` or `magiclink`
--           and whose `timestamp` (epoch seconds) is at or after the
--           request time AND within the last 60 minutes;
--        b. the current auth.users.email = requested_for, and the JWT's own
--           `email` claim = requested_for;
--        c. the account's email has not changed since 24 hours before that
--           amr timestamp (auth_email_changes).
--      OR the account has a Google identity whose verified email is the
--      account's email — Google has already proven it.
--      Returns true when it stamped, false when the session does not prove
--      the address. Raises 53400 'email_verify_rate_limited' only when its
--      own profile write hits the profile_write limit, so the app can say
--      "too many tries" instead of "not proven".
--
--      THE GUARANTEE, and why each part is there (a reviewer broke the first
--      version on staging, 2026-11-18): the first version accepted ANY
--      otp/magiclink amr entry, ignored its time, and stamped whatever the
--      auth email was AT THE TIME OF THE CALL. So: verify own address A by
--      link -> updateUser({ email: B }) (production auto-confirms, B applies
--      at once) -> call mark_email_verified() again in the same session ->
--      B "verified" -> approve_family_join records under-13 consent for an
--      address nobody proved. Now:
--        - (a) a link/code session older than the request proves nothing
--          about this request; the request is cleared on success, so the
--          same session can never stamp twice;
--        - (b) the address stamped is the one the link was requested for,
--          and still the account's address;
--        - (c) closes the slower variant: ask for a code to an address you
--          own, change the account's email to one you don't, request, and
--          only THEN redeem the code. A code is valid for at most 24 hours
--          (Supabase's ceiling on email OTP expiry), so a redemption with no
--          email change in the 24 hours before it was sent to the address
--          the account has now. This is why an email change blocks
--          verification for a day; Seeded has no email-change screen, so
--          only someone driving the Auth API directly meets it.
--      What it still rests on: Supabase delivering the link/code to the
--      address on the account, and amr timestamps being the time the
--      session was authenticated (GoTrue: mfa_amr_claims.updated_at).
--      'recovery' and 'email/signup' were accepted by the first version and
--      no longer are: the app never sends either for this purpose.
--   3. email_is_verified(uuid) — SECURITY DEFINER, INTERNAL (no EXECUTE for
--      anon or authenticated; only the RPCs below, which run as the owner,
--      call it). True when email_verified_for matches the CURRENT auth email
--      (case-insensitive) and email_verified_at is set, or the Google rule
--      above holds.
--   4. join_family(), approve_family_join(), grant_parent_consent(): when the
--      CALLER's profile role is 'parent' and email_is_verified(caller) is
--      false -> raise 42501 'verify_email_required'. Players are never
--      checked. Every existing check, return shape, grant and the join rate
--      limit are preserved — each body below is its current version
--      (023 / 030) with one block added.
--        - join_family: the check runs BEFORE the attempt is logged, so a
--          refused parent learns nothing about the code and spends none of
--          the 5/hour budget. (The 023 note about RAISE rolling back the
--          attempt row does not apply: nothing has been logged yet.)
--        - approve_family_join: right after the sign-in check. A player
--          approving is unaffected.
--        - grant_parent_consent: after the "not a parent account" return
--          (the caller is a parent by then), before any lookup.
--   5. rate_limit_for_bucket(): adds 'email_verify' = 3/hour, spent by
--      request_email_verification(). Every other bucket is unchanged (035's
--      list). Be exact about what this limits: Seeded's OWN path. Anyone
--      holding the public anon key can call Supabase Auth's signInWithOtp
--      directly and never touch this bucket; the limits on that are Supabase
--      project settings (Auth -> Rate Limits, and SMTP), not this repo.
--   6. protect_privileged_profile_columns(): 041's version plus the four new
--      privileged columns.
--
-- ===========================================================================
-- Verify (as real users: set local role authenticated + jwt claims)
-- ===========================================================================
--   unverified parent: select public.approve_family_join('<pending uid>');   -> 42501 verify_email_required
--   unverified parent: select public.grant_parent_consent('<child uid>');    -> 42501 verify_email_required
--   unverified parent: select public.join_family('<code>');                  -> 42501 verify_email_required
--   player:            select public.approve_family_join('<pending uid>');   -> {"status":"approved",...}
--   claims with "amr":[{"method":"password",...}]: select public.mark_email_verified(); -> false
--   select public.request_email_verification();    -> {"allowed":true,"email":...}
--   claims with "amr":[{"method":"otp","timestamp":<after the request>}] and
--     "email":<that address>:                      select public.mark_email_verified(); -> true
--   the same claims, called again:                 -> false (request consumed)
--   amr timestamp before the request, or > 60 min old: -> false
--   then the same parent: approve / consent -> allowed
--   any user: update profiles set email_verified_at = now() where id = auth.uid(); -> 42501
--
-- ===========================================================================
-- Rollback (runnable). Restores 023/030's RPCs, 041's trigger and 035's
-- bucket list, then drops the new objects. The verified timestamps are lost.
-- ===========================================================================
--   begin;
--   -- 1. Re-run, verbatim, in this order (grants are kept by
--   --    `create or replace`; the revoke/grant pairs are in each block):
--   --      join_family            -> 023_family_join_rpc.sql §5
--   --      grant_parent_consent   -> 030_under13_parent_consent.sql
--   --      approve_family_join    -> 030_under13_parent_consent.sql (its LAST definition)
--   --      rate_limit_for_bucket  -> 035_fix_upsert_writes_and_deletion.sql §3
--   --      protect_privileged_profile_columns -> 041_diagnostic_onboarding_fields.sql
--   --    All five are reproduced as one pasteable block in
--   --    docs/HANDOFF.md §J Step 18.
--   -- 2. Then:
--   drop trigger if exists seeded_note_auth_email_change on auth.users;
--   drop function if exists public.note_auth_email_change();
--   drop function if exists public.request_email_verification();
--   drop function if exists public.mark_email_verified();
--   drop function if exists public.email_is_verified(uuid);
--   drop table if exists public.auth_email_changes;
--   alter table public.profiles drop column if exists email_verify_requested_at;
--   alter table public.profiles drop column if exists email_verify_requested_for;
--   alter table public.profiles drop column if exists email_verified_for;
--   alter table public.profiles drop column if exists email_verified_at;
--   commit;
--   Order matters: the three RPCs call email_is_verified() and the trigger
--   reads the columns, so restore them BEFORE dropping either.

alter table public.profiles add column if not exists email_verified_at timestamptz;
alter table public.profiles add column if not exists email_verified_for text;
alter table public.profiles add column if not exists email_verify_requested_for text;
alter table public.profiles add column if not exists email_verify_requested_at timestamptz;

comment on column public.profiles.email_verified_at is
  'When this account proved it owns email_verified_for (a magic link / OTP session newer than its request, or a Google identity). PRIVILEGED: set only by mark_email_verified() (043). NOT auth.users.email_confirmed_at, which auto-confirm stamps at sign-up.';
comment on column public.profiles.email_verified_for is
  'The address email_verified_at was proven for. Verification only counts while it equals the current auth email. PRIVILEGED (043).';
comment on column public.profiles.email_verify_requested_for is
  'The auth email a verification link was last requested for, by request_email_verification(). Cleared when mark_email_verified() succeeds. PRIVILEGED (043).';
comment on column public.profiles.email_verify_requested_at is
  'When that link was requested. A link/code session only proves the address if it was authenticated at or after this time. PRIVILEGED (043).';

-- ---------------------------------------------------------------------------
-- 0. When the account's email last changed. Written by a trigger on
--    auth.users (so it is recorded even before a profile row exists), read
--    only by the two SECURITY DEFINER functions below. No client access.
-- ---------------------------------------------------------------------------
create table if not exists public.auth_email_changes (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  changed_at timestamptz not null default now()
);
comment on table public.auth_email_changes is
  'When each account''s auth email last changed (043). A link or code redeemed within 24 hours of a change may have been sent to the OLD address, so mark_email_verified() refuses it. No client access.';
alter table public.auth_email_changes enable row level security;
revoke all on table public.auth_email_changes from public, anon, authenticated;
grant all on table public.auth_email_changes to service_role;

create or replace function public.note_auth_email_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  insert into public.auth_email_changes (user_id, changed_at)
  values (new.id, now())
  on conflict (user_id) do update set changed_at = excluded.changed_at;
  return new;
end;
$fn$;
revoke all on function public.note_auth_email_change() from public, anon, authenticated;

drop trigger if exists seeded_note_auth_email_change on auth.users;
create trigger seeded_note_auth_email_change
  after update of email on auth.users
  for each row
  when (old.email is distinct from new.email)
  execute function public.note_auth_email_change();

-- ---------------------------------------------------------------------------
-- 1. The trigger: 041's version + four privileged columns
-- ---------------------------------------------------------------------------
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
    -- 043: proven only by mark_email_verified(), never by a payload.
    new.email_verified_at      := null;
    new.email_verified_for     := null;
    new.email_verify_requested_for := null;
    new.email_verify_requested_at  := null;

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
  or new.email_verified_at      is distinct from old.email_verified_at
  or new.email_verified_for     is distinct from old.email_verified_for
  or new.email_verify_requested_for is distinct from old.email_verify_requested_for
  or new.email_verify_requested_at  is distinct from old.email_verify_requested_at
  then
    raise exception 'This profile field can only be changed by Seeded.'
      using errcode = '42501';
  end if;

  if old.birth_year is not null and new.birth_year is distinct from old.birth_year then
    raise exception 'Date of birth can only be changed by Seeded. Contact support.'
      using errcode = '42501';
  end if;

  -- 041: birth_month is write-once, like birth_year.
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

-- ---------------------------------------------------------------------------
-- 2. email_is_verified — internal
-- ---------------------------------------------------------------------------
create or replace function public.email_is_verified(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select
    exists (
      select 1
      from public.profiles p
      join auth.users u on u.id = p.id
      where p.id = p_user_id
        and p.email_verified_at is not null
        and p.email_verified_for is not null
        and u.email is not null
        and lower(p.email_verified_for) = lower(u.email)
    )
    or exists (
      select 1
      from auth.identities i
      join auth.users u on u.id = i.user_id
      where i.user_id = p_user_id
        and i.provider = 'google'
        and u.email is not null
        and lower(i.identity_data ->> 'email') = lower(u.email)
        and lower(coalesce(i.identity_data ->> 'email_verified', 'false')) = 'true'
    );
$fn$;
-- Internal: only the SECURITY DEFINER RPCs below call it. Not an oracle.
revoke all on function public.email_is_verified(uuid) from public, anon, authenticated;
grant execute on function public.email_is_verified(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 3a. request_email_verification — called BEFORE every link is sent
-- ---------------------------------------------------------------------------
create or replace function public.request_email_verification()
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_user uuid := auth.uid();
  v_email text;
  v_limit jsonb;
  v_updated int;
begin
  if v_user is null then
    raise exception 'Sign in first.' using errcode = '28000';
  end if;

  select u.email into v_email from auth.users u where u.id = v_user;
  if coalesce(v_email, '') = '' then
    return jsonb_build_object('allowed', false, 'reason', 'no_email');
  end if;

  -- A link redeemed within 24 hours of an email change may be one that was
  -- sent to the OLD address (header, (c)). Say so up front rather than send
  -- a link mark_email_verified() would refuse.
  if exists (
    select 1 from public.auth_email_changes c
    where c.user_id = v_user and c.changed_at > now() - interval '24 hours'
  ) then
    return jsonb_build_object('allowed', false, 'reason', 'email_recently_changed');
  end if;

  -- The 'email_verify' bucket (3/hour), inside SQL so a caller cannot raise
  -- its own ceiling. It limits Seeded's path only: see the header, 5.
  v_limit := public.consume_rate_limit('email_verify');
  if coalesce((v_limit ->> 'allowed')::boolean, false) is not true then
    return jsonb_build_object('allowed', false, 'reason', 'rate_limited',
                              'retry_after_seconds', v_limit -> 'retry_after_seconds');
  end if;

  begin
    update public.profiles
    set email_verify_requested_for = v_email,
        email_verify_requested_at  = now()
    where id = v_user;
    get diagnostics v_updated = row_count;
  exception when sqlstate '53400' then
    -- profile_write is spent (the rate-limit trigger on profiles).
    return jsonb_build_object('allowed', false, 'reason', 'rate_limited');
  end;

  if v_updated = 0 then
    return jsonb_build_object('allowed', false, 'reason', 'no_profile');
  end if;

  -- The app sends the link to THIS address, never one it was handed.
  return jsonb_build_object('allowed', true, 'email', v_email);
end;
$fn$;
revoke all on function public.request_email_verification() from public, anon;
grant execute on function public.request_email_verification() to authenticated;

-- ---------------------------------------------------------------------------
-- 3b. mark_email_verified — the only writer of the verified columns
-- ---------------------------------------------------------------------------
create or replace function public.mark_email_verified()
returns boolean
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_user uuid := auth.uid();
  v_amr jsonb := auth.jwt() -> 'amr';
  v_jwt_email text := auth.jwt() ->> 'email';
  v_email text;
  v_requested_for text;
  v_requested_at timestamptz;
  v_changed_at timestamptz;
  v_proof_at numeric;
  v_proven boolean := false;
  v_updated int;
begin
  if v_user is null then
    raise exception 'Sign in first.' using errcode = '28000';
  end if;

  select u.email into v_email from auth.users u where u.id = v_user;
  if coalesce(v_email, '') = '' then
    return false;
  end if;

  select p.email_verify_requested_for, p.email_verify_requested_at
  into v_requested_for, v_requested_at
  from public.profiles p where p.id = v_user;

  select c.changed_at into v_changed_at
  from public.auth_email_changes c where c.user_id = v_user;

  -- amr is [{"method": "...", "timestamp": <epoch seconds>}, ...]. Only an
  -- otp / magiclink entry WITH a numeric timestamp counts; the bare-string
  -- shape carries no time and so proves nothing about this request.
  if jsonb_typeof(v_amr) = 'array' then
    select max((e ->> 'timestamp')::numeric) into v_proof_at
    from jsonb_array_elements(v_amr) e
    where jsonb_typeof(e) = 'object'
      and e ->> 'method' in ('otp', 'magiclink')
      and jsonb_typeof(e -> 'timestamp') = 'number';
  end if;

  v_proven :=
        v_proof_at is not null
    and v_requested_at is not null
    and v_requested_for is not null
    -- (a) authenticated by the link/code AFTER the request (amr timestamps
    --     are whole seconds), and within the last 60 minutes.
    and v_proof_at >= floor(extract(epoch from v_requested_at))
    and v_proof_at >= extract(epoch from now() - interval '60 minutes')
    -- (b) the address the link was requested for is still the account's,
    --     and is the one this session's token was issued for.
    and lower(v_email) = lower(v_requested_for)
    and lower(coalesce(v_jwt_email, '')) = lower(v_requested_for)
    -- (c) no email change in the 24 hours before the code was redeemed.
    and (v_changed_at is null
         or extract(epoch from v_changed_at) <= v_proof_at - 86400);

  if not v_proven then
    -- Google has already proven the address; no link needed. Checked as
    -- an identity whose verified email IS the account's email.
    select exists (
      select 1 from auth.identities i
      where i.user_id = v_user
        and i.provider = 'google'
        and lower(i.identity_data ->> 'email') = lower(v_email)
        and lower(coalesce(i.identity_data ->> 'email_verified', 'false')) = 'true'
    ) into v_proven;
  end if;

  if not v_proven then
    return false;
  end if;

  -- Runs as the function owner, so 043's trigger lets it through (the
  -- current_user exemption); the rate-limit trigger still counts it against
  -- the caller's profile_write bucket. Clearing the request means this
  -- session can never stamp again.
  begin
    update public.profiles
    set email_verified_at          = now(),
        email_verified_for         = v_email,
        email_verify_requested_for = null,
        email_verify_requested_at  = null
    where id = v_user;
    get diagnostics v_updated = row_count;
  exception when sqlstate '53400' then
    -- Distinct from "not proven": the app says "too many tries".
    raise exception 'email_verify_rate_limited' using errcode = '53400';
  end;

  return v_updated > 0;
end;
$fn$;
revoke all on function public.mark_email_verified() from public, anon;
grant execute on function public.mark_email_verified() to authenticated;

-- ---------------------------------------------------------------------------
-- 4a. join_family — 023's body + the parent check before anything is logged
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
  -- WHY THIS RETURNS A STATUS INSTEAD OF RAISING: see 023. Expected outcomes
  -- RETURN so the attempt row commits and the rate limiter counts it. Only
  -- "not signed in", "rate limited" and (043) "verify your email" raise, and
  -- none of them needs to be logged.
  if v_user is null then
    raise exception 'Sign in first.' using errcode = '28000';
  end if;

  -- 043: a parent account must have proven its email before it can ask to
  -- join a family. Checked BEFORE the attempt is logged or the code is
  -- looked up: the caller learns nothing about the code and spends none of
  -- the 5/hour budget. Players are never checked.
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
-- 4b. grant_parent_consent — 030's body + the check once we know it is a parent
-- ---------------------------------------------------------------------------
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

  -- 043: consent is the one statement only an adult can make; the least
  -- Seeded can ask is that the adult proved they own the address on file.
  if not public.email_is_verified(v_user) then
    raise exception 'verify_email_required' using errcode = '42501';
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
-- 4c. approve_family_join — 030's body + the parent check up front
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
  v_consent text := null;
begin
  if v_user is null then
    raise exception 'Sign in first.' using errcode = '28000';
  end if;

  -- 043: a PARENT approving must have proven their email (approving as a
  -- parent also records consent for a pending under-13, below). A player
  -- approving is never checked.
  if exists (select 1 from public.profiles where id = v_user and role = 'parent')
     and not public.email_is_verified(v_user) then
    raise exception 'verify_email_required' using errcode = '42501';
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
-- 5. rate_limit_for_bucket — 035's list + email_verify
-- ---------------------------------------------------------------------------
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
    -- 043: spent by request_email_verification() before Seeded sends a
    -- link. Three an hour is plenty for a person. It bounds SEEDED'S path
    -- only: signInWithOtp is reachable directly with the public anon key,
    -- so the project's email budget rests on Supabase Auth's own rate
    -- limits (a project setting), not on this bucket.
    when 'email_verify'      then 3
    else null
  end;
$$;
revoke all on function public.rate_limit_for_bucket(text) from public, anon;
grant execute on function public.rate_limit_for_bucket(text) to authenticated;
