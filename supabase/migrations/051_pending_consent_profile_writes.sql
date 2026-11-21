-- 051_pending_consent_profile_writes.sql
--
-- STATUS: written and attack-tested on STAGING 2026-11-20 (night). NOT on
-- production: production needs Niran's explicit, current-turn go
-- (GO-SEQUENCE row 26). Found by the review-ready sweep (R9 HIGH-1).
--
-- The gap: 030 makes an under-13 account inert until a parent consents — a
-- RESTRICTIVE `account_active_required` policy on 21 tables — but `profiles`
-- has a deliberate carve-out for the caller's OWN row (030 lines ~245-252) so
-- a pending account can read itself, fill in a missing birth year and delete
-- itself. That carve-out covers EVERY column, so a pending account could also
-- write tennis data onto its own profile: the sweep added a target school
-- through the UI, it survived a reload, and `target_school_slugs` changed in
-- the database. The app tells the child no schools can be saved, and /privacy
-- says such an account "cannot record anything about tennis".
--
-- The fix keeps the carve-out (removing it would lock a pending child out of
-- the waiting screen) and narrows what an UPDATE may change while the caller
-- is not active: no tennis or recruiting data (target schools, UTR,
-- weaknesses, commitment date, tournament counts, UTR profile link). Profile
-- details /terms promises they can still edit (name, grade, graduation year,
-- GPA, onboarding state, birth year/month where still missing) are left
-- alone, so the waiting screen and onboarding keep working. A BEFORE UPDATE trigger, so it also covers the app's upsert
-- path (an INSERT ... ON CONFLICT DO UPDATE fires it). Unchanged columns
-- pass, so re-saving a whole row still works.
--
-- NOT covered (documented, deliberate): the INSERT that creates the profile
-- at sign-up. A pending account is created pending by that insert; refusing
-- tennis fields there would break sign-up for every under-13 whose client
-- sends them. Follow-up: have sign-up omit them for under-13s, then extend.
--
-- Service role, postgres and SECURITY DEFINER functions (which run as the
-- owner — e.g. record_parent_consent) are exempt, like 022's trigger.

create or replace function public.pending_consent_profile_guard()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if current_user in ('service_role', 'postgres', 'supabase_admin') then
    return new;
  end if;
  if public.account_active() then
    return new;
  end if;
  if new.target_school_slugs is distinct from old.target_school_slugs
     or new.current_utr is distinct from old.current_utr
     or new.weaknesses is distinct from old.weaknesses
     or new.commitment_date is distinct from old.commitment_date
     or new.tournaments_goal is distinct from old.tournaments_goal
     or new.tournaments_planned_season is distinct from old.tournaments_planned_season
     or new.tournaments_played is distinct from old.tournaments_played
     or new.utr_profile_link is distinct from old.utr_profile_link
  then
    raise exception 'consent_required: this account cannot record tennis or recruiting details until a parent approves it'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.pending_consent_profile_guard() from public, anon, authenticated;

drop trigger if exists pending_consent_profile_guard on public.profiles;
create trigger pending_consent_profile_guard
  before update on public.profiles
  for each row execute function public.pending_consent_profile_guard();

-- ---------------------------------------------------------------------------
-- ROLLBACK (pasteable):
--   drop trigger if exists pending_consent_profile_guard on public.profiles;
--   drop function if exists public.pending_consent_profile_guard();
-- ---------------------------------------------------------------------------
