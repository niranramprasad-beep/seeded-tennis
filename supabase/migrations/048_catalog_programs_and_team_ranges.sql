-- 048_catalog_programs_and_team_ranges.sql
--
-- STATUS: written 2026-11-19 for PR E ("catalog phase 1"). Applied and probed
-- on STAGING (gnlcpnsweqbtwpaqhqqg) only. NOT on production. Production needs
-- the owner's explicit, current-turn sign-off like every other migration.
-- Independent of 046/047 (other PRs): it touches no existing table, policy or
-- function, and reads only account_active() (030) and set_updated_at().
--
-- ===========================================================================
-- Why
-- ===========================================================================
-- docs/CATALOG_EXPANSION.md: the catalog is 68 mostly upper-D1 programs in
-- TypeScript files, so a 5-9 UTR junior sees nothing in Target or Likely.
-- Phase 1 imports programs from official public rosters (one TSV the owner
-- compiled) into the database. Two kinds of fact arrive, with different
-- sources, so they live in different tables:
--
--   1. That a program exists, and how many players its roster lists in each
--      graduating class. Source: the program's own roster page, read on a
--      known date. -> programs, program_class_counts
--   2. The team's UTR range. NOT in the roster file, never scraped, never
--      guessed. Entered by the owner, one range at a time, each with its own
--      source and date. -> team_ranges
--
-- ===========================================================================
-- What is deliberately NOT stored
-- ===========================================================================
-- * No player names, no hometowns, no per-player rows at all. The roster file
--   lists college students by name; the product needs only "how many are in
--   their final year". The importer reads names solely to drop exact
--   duplicates in memory and never writes them anywhere (not to the
--   database, not to its JSON summary, not to its error report).
-- * No UTR anything on programs. A program with no team_ranges row has NO
--   level: the UI says "Level not rated yet" and the program never reaches
--   classifySchoolFit (lib/catalog/programs.ts, bandableRange()).
--
-- ===========================================================================
-- Who can write
-- ===========================================================================
-- * programs / program_class_counts: nobody but the service role. Written by
--   scripts/import-rosters.ts, which refuses to run against production.
--   No client policy for INSERT/UPDATE/DELETE exists, and the table grants
--   are revoked too, so a missing policy is not the only thing in the way.
-- * team_ranges: INSERT only, only by an app admin (app_admins below), only
--   as themselves (entered_by = auth.uid()), only with a source and a date
--   that is not in the future. No UPDATE, no DELETE from any client: ranges
--   are history and the newest one is current; a correction is a new row.
-- * app_admins: no client write path at all, and no client read either.
--   The owner adds themselves once, in the SQL editor:
--     insert into public.app_admins (user_id, note) values ('<uuid>', 'owner');
--   is_app_admin() answers only about the caller.
--
-- Rollback (staging): drop table public.team_ranges, public.program_class_counts,
-- public.programs, public.app_admins; drop function public.is_app_admin();
-- Nothing else references them.

-- ---------------------------------------------------------------- app_admins

create table if not exists public.app_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  note text,
  created_at timestamptz not null default now()
);

alter table public.app_admins enable row level security;
-- No policies on purpose: RLS on with no policy = authenticated and anon can
-- neither read nor write. Grants revoked as well (belt and braces).
revoke all on table public.app_admins from public, anon, authenticated;

create or replace function public.is_app_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (select 1 from public.app_admins a where a.user_id = auth.uid());
$$;

-- Used inside an RLS policy, so `authenticated` MUST keep EXECUTE (027: the
-- privilege is checked against the querying role; revoking it fails the
-- policy closed). It only ever answers about the caller.
revoke all on function public.is_app_admin() from public, anon;
grant execute on function public.is_app_admin() to authenticated;

-- ------------------------------------------------------------------ programs

create table if not exists public.programs (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  school text not null check (length(btrim(school)) > 0),
  gender text not null check (gender in ('men', 'women')),
  division text not null check (division in ('D1', 'D2', 'D3', 'NAIA', 'JUCO')),
  conference text not null check (length(btrim(conference)) > 0),
  -- As printed on the official roster page. Unchecked spelling (see the
  -- import report); not rendered in phase 1.
  head_coach text,
  roster_url text check (roster_url is null or roster_url ~ '^https?://'),
  -- The season the roster page showed when it was read, e.g. '2025-26'. A
  -- 2025-26 roster read in November 2026 is last season's and the UI says so.
  season_shown text not null check (season_shown ~ '^[0-9]{4}-[0-9]{2}$'),
  season_start_year int not null check (season_start_year between 2000 and 2100),
  -- Players the roster listed, and how many of them had a class label the
  -- importer could not read (counted, never guessed).
  players_listed int not null default 0 check (players_listed >= 0),
  unknown_class_count int not null default 0 check (unknown_class_count >= 0),
  last_verified date,
  source_url text check (source_url is null or source_url ~ '^https?://'),
  source_date date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (unknown_class_count <= players_listed)
);

create index if not exists programs_gender_division_idx on public.programs (gender, division);

drop trigger if exists programs_set_updated_at on public.programs;
create trigger programs_set_updated_at
  before update on public.programs
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------ program_class_counts

create table if not exists public.program_class_counts (
  program_id uuid not null references public.programs (id) on delete cascade,
  -- Graduation class year, relative to the roster's season: on a 2026-27
  -- roster a senior is class_year 2027. lib/catalog/class-year.ts.
  class_year int not null check (class_year between 2000 and 2100),
  players int not null check (players >= 0),
  primary key (program_id, class_year)
);

-- --------------------------------------------------------------- team_ranges

create table if not exists public.team_ranges (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs (id) on delete cascade,
  -- floor / middle / top, per docs/CATALOG_EXPANSION.md. classifySchoolFit
  -- needs the floor (Target/Reach line) AND the middle (Likely/Target line);
  -- a midpoint of low and high would be an invented median, so the middle
  -- is entered, not derived.
  low numeric(4, 2) not null check (low between 1 and 16.5),
  middle numeric(4, 2) not null check (middle between 1 and 16.5),
  high numeric(4, 2) not null check (high between 1 and 16.5),
  source_type text not null check (source_type in ('licensed_feed', 'coach_submitted', 'hand_curated')),
  source text not null check (length(btrim(source)) >= 3),
  source_url text check (source_url is null or source_url ~ '^https?://'),
  source_date date not null,
  entered_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  check (low <= middle and middle <= high)
);

create index if not exists team_ranges_program_idx on public.team_ranges (program_id, source_date desc, created_at desc);

-- ---------------------------------------------------------------------- RLS

alter table public.programs enable row level security;
alter table public.program_class_counts enable row level security;
alter table public.team_ranges enable row level security;

-- Catalog data: public read, for the signed-out /schools page too.
drop policy if exists programs_public_read on public.programs;
create policy programs_public_read on public.programs
  for select to anon, authenticated using (true);

drop policy if exists program_class_counts_public_read on public.program_class_counts;
create policy program_class_counts_public_read on public.program_class_counts
  for select to anon, authenticated using (true);

drop policy if exists team_ranges_public_read on public.team_ranges;
create policy team_ranges_public_read on public.team_ranges
  for select to anon, authenticated using (true);

drop policy if exists team_ranges_insert_admin on public.team_ranges;
create policy team_ranges_insert_admin on public.team_ranges
  for insert to authenticated
  with check (
    (select public.is_app_admin())
    and (select public.account_active())
    and entered_by = (select auth.uid())
    and source_date <= current_date
  );

-- Grants. Supabase grants ALL on new public tables to anon and authenticated
-- by default; RLS would refuse the writes anyway, but a table nobody may
-- write should not carry a write grant waiting for a stray policy.
revoke all on table public.programs from public, anon, authenticated;
revoke all on table public.program_class_counts from public, anon, authenticated;
revoke all on table public.team_ranges from public, anon, authenticated;

grant select on table public.programs to anon, authenticated;
grant select on table public.program_class_counts to anon, authenticated;

-- team_ranges: every column EXCEPT entered_by is readable. entered_by is the
-- admin's auth user id; publishing it to every visitor would be a needless
-- identifier leak. Clients must therefore name their columns (no select *).
grant select (id, program_id, low, middle, high, source_type, source, source_url, source_date, created_at)
  on table public.team_ranges to anon, authenticated;
-- INSERT names the columns a client may supply. id, created_at and
-- entered_by take their defaults; the policy re-checks entered_by.
grant insert (program_id, low, middle, high, source_type, source, source_url, source_date)
  on table public.team_ranges to authenticated;
