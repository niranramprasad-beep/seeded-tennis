-- 054_program_roster_and_staff.sql
--
-- STATUS: written 2026-11-22 for the roster pages (Niran: "build the roster
-- pages … all the data in the spreadsheet … whenever you click on the
-- schools"). Apply to STAGING first; production on Niran's go.
--
-- ===========================================================================
-- Why, and the decision it implements
-- ===========================================================================
-- Migration 048 deliberately stored NO player names. On 2026-11-22 Niran
-- decided (DECISIONS.md, same date) that each school page shows its full
-- official roster by name, and the coaching staff with the emails the school
-- publishes. Both come from the owner's sheet "College Tennis UTR Database",
-- which a person filled by reading each program's OFFICIAL roster and staff
-- pages and each player's public UTR profile (docs/data/LAUNCH_DATA_SPEC.md).
--
-- * program_roster: one row per player ON THE OFFICIAL ROSTER (the sheet's
--   "UTR only" / "not on roster page yet" rows are left out, as its own team
--   counts do). Name and class as the roster prints them, graduating year,
--   singles UTR and whether the sheet marked it reliable, the UTR profile
--   link the rating was read from, hometown, and the read date.
-- * program_staff: head coach and assistants with titles, from the official
--   coaches/staff page; an email only where that page publishes one. Every
--   row carries the page it was read from (NOT NULL) and the date.
--
-- Nothing here is derived or guessed. Rosters are snapshots: the importer
-- replaces a program's rows on each import.
--
-- ===========================================================================
-- Who can write
-- ===========================================================================
-- Nobody but the service role / SQL editor (scripts/import-utr-database.ts
-- --roster writes the SQL). Public read, like programs (048) and
-- program_details (053): the school pages are public.
--
-- Rollback: drop table public.program_staff; drop table public.program_roster;
-- (nothing references them)

create table if not exists public.program_roster (
  program_id uuid not null references public.programs (id) on delete cascade,
  player_name text not null check (length(btrim(player_name)) > 0),
  -- Normalised from the roster's label: Freshman / Sophomore / Junior /
  -- Senior / Graduate, or the label as printed when it is anything else.
  class_label text check (class_label is null or length(btrim(class_label)) > 0),
  grad_year int check (grad_year is null or grad_year between 2000 and 2100),
  utr numeric(4, 2) check (utr is null or utr between 1 and 16.5),
  utr_reliable boolean not null default false,
  utr_profile_url text check (utr_profile_url is null or utr_profile_url ~ '^https?://'),
  hometown text check (hometown is null or length(btrim(hometown)) > 0),
  read_date date not null,
  -- A rating is stored only with the profile it was read from.
  check (utr is null or utr_profile_url is not null),
  primary key (program_id, player_name)
);

create table if not exists public.program_staff (
  program_id uuid not null references public.programs (id) on delete cascade,
  name text not null check (length(btrim(name)) > 0),
  title text check (title is null or length(btrim(title)) > 0),
  -- Only an address the official page prints. Never inferred from a pattern.
  email text check (email is null or email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  is_head boolean not null default false,
  source_url text not null check (source_url ~ '^https?://'),
  read_date date not null,
  primary key (program_id, name)
);

alter table public.program_roster enable row level security;
alter table public.program_staff enable row level security;

drop policy if exists program_roster_public_read on public.program_roster;
create policy program_roster_public_read on public.program_roster
  for select to anon, authenticated using (true);

drop policy if exists program_staff_public_read on public.program_staff;
create policy program_staff_public_read on public.program_staff
  for select to anon, authenticated using (true);

revoke all on table public.program_roster from public, anon, authenticated;
revoke all on table public.program_staff from public, anon, authenticated;
grant select on table public.program_roster to anon, authenticated;
grant select on table public.program_staff to anon, authenticated;
