-- 053_program_details.sql
--
-- STATUS: written 2026-11-22 for the spreadsheet sync (Herdy's 2026-11-21
-- action item: "sync the school data spreadsheet with the website"). Apply to
-- STAGING first. Production needs the owner's explicit, current-turn go.
-- Independent of everything after 048: it adds one table and touches no
-- existing table, policy or function.
--
-- ===========================================================================
-- Why
-- ===========================================================================
-- The owner's sheet "College Tennis UTR Database" gained a "Program Info" tab
-- on 2026-11-22: per team, the school's city/state, cost of attendance,
-- acceptance rate, undergraduate enrollment, the coaches page and the
-- recruiting questionnaire link — each value with the URL it was read from
-- and a read date (docs/data/LAUNCH_DATA_SPEC.md). Migration 048's programs
-- table has nowhere to put them. This table does, one row per program.
--
-- ===========================================================================
-- What is deliberately NOT stored
-- ===========================================================================
-- * No coach names and no coach emails, although the sheet has published
--   ones. Whether to show them is the owner's open decision (P0-3 deleted
--   invented ones; lib/db/schools-catalog-honesty.test.ts still blocks coach
--   fields on School). Adding them later is a new migration, not a column
--   left waiting here.
-- * No free-text notes, and no ITA rank (none published for 2026-27 when the
--   sheet was read; a column with no data is not added).
-- * Nothing without its source: every value has a CHECK tying it to the URL
--   it came from, so a number can never be stored unsourced.
--
-- ===========================================================================
-- Who can write
-- ===========================================================================
-- Nobody but the service role / SQL editor (scripts/import-utr-database.ts
-- --program-info writes the SQL). No client write policy, write grants
-- revoked. Public read, like programs: it is catalog data a signed-out
-- visitor's browser may read.
--
-- Rollback: drop table public.program_details;  (nothing references it)

create table if not exists public.program_details (
  program_id uuid primary key references public.programs (id) on delete cascade,
  city text check (city is null or length(btrim(city)) > 0),
  state text check (state is null or state ~ '^[A-Z]{2}$'),
  -- Cost of attendance in US dollars for one academic year (COA year below),
  -- as published by the school or College Scorecard.
  cost_of_attendance_usd int check (cost_of_attendance_usd is null or cost_of_attendance_usd between 1000 and 200000),
  coa_year text check (coa_year is null or coa_year ~ '^[0-9]{4}-[0-9]{2}$'),
  coa_source_url text check (coa_source_url is null or coa_source_url ~ '^https?://'),
  -- College Scorecard: admission rate as a fraction (0.2420 = 24.2%) and
  -- undergraduate enrollment.
  acceptance_rate numeric(5, 4) check (acceptance_rate is null or (acceptance_rate > 0 and acceptance_rate <= 1)),
  undergrad_enrollment int check (undergrad_enrollment is null or undergrad_enrollment > 0),
  scorecard_source_url text check (scorecard_source_url is null or scorecard_source_url ~ '^https?://'),
  coaches_page_url text check (coaches_page_url is null or coaches_page_url ~ '^https?://'),
  questionnaire_url text check (questionnaire_url is null or questionnaire_url ~ '^https?://'),
  read_date date not null,
  updated_at timestamptz not null default now(),
  -- A number is stored only with the page it was read from.
  check (cost_of_attendance_usd is null or (coa_year is not null and coa_source_url is not null)),
  check ((acceptance_rate is null and undergrad_enrollment is null) or scorecard_source_url is not null)
);

drop trigger if exists program_details_set_updated_at on public.program_details;
create trigger program_details_set_updated_at
  before update on public.program_details
  for each row execute function public.set_updated_at();

alter table public.program_details enable row level security;

drop policy if exists program_details_public_read on public.program_details;
create policy program_details_public_read on public.program_details
  for select to anon, authenticated using (true);

-- Supabase grants ALL on new public tables to anon and authenticated by
-- default; a table nobody may write from a client should not carry a write
-- grant waiting for a stray policy (same as 048).
revoke all on table public.program_details from public, anon, authenticated;
grant select on table public.program_details to anon, authenticated;
