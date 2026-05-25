-- ============================================================================
-- CRITICAL FIX: "infinite recursion detected in policy for relation profiles"
-- ============================================================================
-- The old "family members read" policy (from 0001_init.sql) SELECTed from
-- profiles *inside* a profiles policy, which Postgres rejects as infinite
-- recursion (error 42P17). Every read of profiles then returns HTTP 500, so the
-- app can't load a user's profile after login (it fell back to demo data) and
-- signup's profile write failed too.
--
-- This migration removes the recursive policy and replaces family-sharing reads
-- with a SECURITY DEFINER helper function that does NOT trigger RLS recursion.
-- Safe to run multiple times.
-- ----------------------------------------------------------------------------

-- 1) Drop the recursive policy (every old name variant, just in case).
drop policy if exists "family members read" on public.profiles;
drop policy if exists "family_members_read" on public.profiles;

-- 2) Helper that returns the current user's family code WITHOUT recursing,
--    because SECURITY DEFINER functions bypass row-level security.
create or replace function public.current_family_code()
returns text
language sql
security definer
set search_path = public
stable
as $$
  select family_code from public.profiles where id = auth.uid()
$$;

-- 3) Re-add family-sharing read with the non-recursive helper, so a parent and
--    player who share a family code can see each other's profile.
create policy "family_members_read" on public.profiles
  for select
  using (
    family_code is not null
    and family_code = public.current_family_code()
  );

-- 4) Make sure the basic own-row policies exist (idempotent).
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles
  for insert with check (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id);
