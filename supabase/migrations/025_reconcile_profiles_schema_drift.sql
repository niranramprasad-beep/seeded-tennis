-- 025_reconcile_profiles_schema_drift.sql
--
-- STATUS: APPLIED TO STAGING 2026-11-14. Safe for production — it is a
-- verified no-op there (production already has every one of these).
--
-- WHY THIS EXISTS
-- Building a database from this repo's migrations does NOT reproduce
-- production. Found 2026-11-14 by applying 0001..021 to a clean staging
-- project and diffing it against prod: 22 of 23 tables matched exactly, and
-- `public.profiles` did not.
--
-- The cause is an ordering trap between the two initial migrations:
--   * 0001_init.sql creates `profiles` with loose definitions (nullable
--     role, nullable arrays, bare `numeric`, no default on name).
--   * 001_initial_saas_schema.sql then says
--       create table if not exists public.profiles (... stricter ...)
--     which is a NO-OP because 0001 already created the table. Every
--     NOT NULL, every default and every inline CHECK in that block is
--     silently skipped. Its `alter table ... add column if not exists`
--     statements only add columns that are missing; they do not tighten
--     columns that already exist.
--
-- Production escaped this (its profiles matches the strict definition), so
-- the drift was invisible until a database was built from the repo for the
-- first time. That is precisely what staging is for.
--
-- Every statement below is guarded, so this is idempotent and a no-op on
-- any database that is already correct — production included.

do $$
begin
  -- current_utr: prod numeric(4,2), repo-built numeric (unbounded precision)
  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='profiles'
      and column_name='current_utr' and numeric_precision is distinct from 4
  ) then
    alter table public.profiles alter column current_utr type numeric(4,2);
  end if;

  -- name: prod defaults to '', repo-built has no default
  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='profiles'
      and column_name='name' and column_default is null
  ) then
    alter table public.profiles alter column name set default '';
  end if;

  -- role / target_school_slugs / weaknesses: NOT NULL in prod, nullable here
  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='profiles'
      and column_name='role' and is_nullable='YES'
  ) then
    update public.profiles set role = 'player' where role is null;
    alter table public.profiles alter column role set not null;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='profiles'
      and column_name='target_school_slugs' and is_nullable='YES'
  ) then
    update public.profiles set target_school_slugs = '{}' where target_school_slugs is null;
    alter table public.profiles alter column target_school_slugs set not null;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='profiles'
      and column_name='weaknesses' and is_nullable='YES'
  ) then
    update public.profiles set weaknesses = '{}' where weaknesses is null;
    alter table public.profiles alter column weaknesses set not null;
  end if;

  -- grade: 0001 says `between 8 and 12`, 001 says `between 1 and 12`.
  -- The repo-built database keeps 0001's, so it REJECTS any player below
  -- 8th grade — which breaks the under-13 flow the product explicitly
  -- supports (a parent creates the account). Production has the 1-12
  -- version, so this is a no-op there.
  if exists (
    select 1 from pg_constraint
    where conname='profiles_grade_check'
      and conrelid='public.profiles'::regclass
      and pg_get_constraintdef(oid) like '%grade >= 8%'
  ) then
    alter table public.profiles drop constraint profiles_grade_check;
    alter table public.profiles
      add constraint profiles_grade_check check (grade >= 1 and grade <= 12);
  end if;

  -- The two inline CHECKs from 001 that never ran
  if not exists (
    select 1 from pg_constraint
    where conname='profiles_tournaments_played_check'
      and conrelid='public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_tournaments_played_check check (tournaments_played >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname='profiles_tournaments_goal_check'
      and conrelid='public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_tournaments_goal_check check (tournaments_goal >= 0);
  end if;
end $$;

-- VERIFICATION (expect zero rows):
--   select column_name, is_nullable, column_default, numeric_precision
--   from information_schema.columns
--   where table_schema='public' and table_name='profiles'
--     and ((column_name='current_utr' and numeric_precision is distinct from 4)
--       or (column_name='name' and column_default is null)
--       or (column_name in ('role','target_school_slugs','weaknesses') and is_nullable='YES'));
--   select conname, pg_get_constraintdef(oid) from pg_constraint
--   where conrelid='public.profiles'::regclass and conname='profiles_grade_check';
--   -- expect: CHECK (((grade >= 1) AND (grade <= 12)))
