-- 024_tier_gating_outreach_player_free_targets.sql
--
-- STATUS: WRITTEN, NOT APPLIED. Do not apply without explicit sign-off.
-- Apply to the STAGING project first (MASTER_ROADMAP P0-6), then prod.
--
-- 023 is reserved for P0-2's join_family() RPC; this is 024 so the two can
-- be written independently without a numbering clash.
--
-- ===========================================================================
-- !! DEPLOYMENT COUPLING — READ BEFORE MERGING v1 TO main !!
--
-- The v1 branch ALREADY contains the UI half of this change: /outreach is
-- gated at `player` instead of `family`, and the star-a-school UI caps Free
-- accounts at 3 targets. If v1 merges to main WITHOUT this migration
-- applied, a Player-tier user gets an outreach board that looks available
-- and then fails every write against the old has_tier('family') policy.
--
-- Apply this migration BEFORE (or in the same change window as) the merge.
-- DEPLOYMENT_CHECKLIST.md carries the same note.
-- ===========================================================================
--
-- Two product decisions from Niran (2026-11-11):
--
--   1. Coach outreach belongs in Player ($19), not Family ($39). Outreach IS
--      the core recruiting loop — gating it at the top tier meant the
--      product's whole point sat behind the most expensive plan, while
--      "unlimited tournament fit checks" (already free and public) was
--      advertised as a Family feature. MASTER_ROADMAP P1-PRICE-1.
--
--   2. Free accounts can track 3 target schools. Previously unlimited,
--      which left Free with no reason to upgrade and no honest ceiling.
--
-- WHY THIS NEEDS TO BE RLS AND NOT JUST THE API ROUTE:
-- `target_school_slugs` lives on public.profiles, and `authenticated` holds
-- UPDATE on that table. A user can PATCH their own profile row directly
-- through PostgREST and never touch /api/profile. Enforcing the cap only in
-- the route would be exactly the P0-1 mistake again: a check the client can
-- route around. The trigger below is the real gate; the route check is a
-- friendly error message in front of it.

-- ---------------------------------------------------------------------------
-- 1. Coach outreach: family -> player
-- ---------------------------------------------------------------------------
-- Mirrors the policy as redefined in 019_rls_policy_hardening.sql. SELECT is
-- untouched (own rows + family members) — only the write tier changes.

drop policy if exists coach_outreach_write_own on public.coach_outreach;
create policy coach_outreach_write_own on public.coach_outreach
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and public.has_tier('player'));

-- ---------------------------------------------------------------------------
-- 2. Free tier: at most 3 target schools
-- ---------------------------------------------------------------------------
-- SECURITY INVOKER for the same reason as 022's trigger: a SECURITY DEFINER
-- function would run as the owner and see current_user = postgres, letting
-- every client write through. We want the CALLER's identity.
--
-- The service role and the DB owner are exempt so support fixes and the Whop
-- webhook are never blocked by a product limit.

create or replace function public.enforce_free_tier_target_limit()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  limit_for_free constant int := 3;
  new_count int;
begin
  if current_user in ('service_role', 'postgres') then
    return new;
  end if;

  new_count := coalesce(array_length(new.target_school_slugs, 1), 0);

  -- Only Free is capped. has_tier('player') is true for player AND family
  -- (see the tier ordering in lib/types.ts TIER_RANK and has_tier's own
  -- definition), so this single check covers both paid tiers.
  if new_count > limit_for_free and not public.has_tier('player') then
    -- Never block a user who is REMOVING schools, even if they are still
    -- over the limit — e.g. an account downgraded from Player to Free with
    -- 10 targets must be able to prune down to 3 rather than being frozen.
    if tg_op = 'UPDATE'
       and new_count < coalesce(array_length(old.target_school_slugs, 1), 0)
    then
      return new;
    end if;

    raise exception
      'Free accounts can track up to % target schools. Upgrade to Player to track more.',
      limit_for_free
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_free_tier_target_limit() from public;

drop trigger if exists enforce_free_tier_target_limit on public.profiles;
create trigger enforce_free_tier_target_limit
  before insert or update of target_school_slugs on public.profiles
  for each row
  execute function public.enforce_free_tier_target_limit();

-- ---------------------------------------------------------------------------
-- VERIFICATION (run on staging as a real Free user, not as postgres)
-- ---------------------------------------------------------------------------
-- begin;
--   set local role authenticated;
--   set local request.jwt.claims = '{"sub":"<free user uuid>","role":"authenticated"}';
--
--   -- expect: success (3 is allowed)
--   update profiles set target_school_slugs = array['a','b','c'] where id = '<free user uuid>';
--   -- expect: 23514 check_violation
--   update profiles set target_school_slugs = array['a','b','c','d'] where id = '<free user uuid>';
--   -- expect: success — outreach now needs only player tier
--   --   (run as a PLAYER-tier user; a free user should still be rejected)
--   insert into coach_outreach (user_id, school_slug, status)
--     values ('<player user uuid>', 'stanford-m', 'researching');
-- rollback;
--
-- Also confirm the downgrade path: set a user to free with 5 targets, then
-- update to 4 — must succeed (shrinking), while 6 must fail.
