-- Real storage for tournaments a family is tracking or has entered, shown
-- in /events' "Upcoming tournaments" list. Before this, there was no
-- persistence for this at all: lib/tournament-fit.ts only ever scored a
-- tournament typed into a one-off form (components/tournaments/
-- tournament-fit-view.tsx, the /tournament-fit page) and threw the input
-- away on page leave. lib/data/tournaments.ts's buildTournaments() is a
-- separate, unrelated thing — a synthetic sample calendar for a generic
-- dashboard widget, never real per-user data — so it isn't a substitute
-- for this table.
--
-- This is the real home for "Add to my events" (lib/supabase/
-- tournaments.ts's saveTournamentEntry, which the Tournament Fit screen's
-- own "Add to my events" button is meant to call once that screen is
-- rebuilt) and for /events' own fit-verdict list, scored against this
-- table's rows via lib/tournament-fit.ts's evaluateTournamentFit.
--
-- NOT applied automatically — this file is tracked in git for review and
-- must be run against the real Supabase project by hand (dev and prod
-- share that project, so this isn't something to run unattended), same
-- discipline as 011_outreach_stages.sql.

create table public.tournament_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  family_code text,
  name text not null,
  level text not null check (level in ('L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'L7', 'utr')),
  event_date date not null,
  city text,
  state text,
  travel_hours numeric(5, 2),
  distance_miles numeric(6, 1),
  draw_utr numeric(4, 2),
  goal_utr numeric(4, 2),
  entry_cost numeric(8, 2),
  travel_cost numeric(8, 2),
  -- "saved" = tracking it, considering it. "entered" = actually registered —
  -- flipped by /events' Enter/Save action (lib/supabase/tournaments.ts's
  -- setTournamentEntryStatus).
  status text not null default 'saved' check (status in ('saved', 'entered')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.tournament_entries enable row level security;

create policy tournament_entries_read on public.tournament_entries
  for select
  using (user_id = auth.uid() or is_family_member(family_code));

create policy tournament_entries_write_own on public.tournament_entries
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop trigger if exists tournament_entries_set_updated_at on public.tournament_entries;
create trigger tournament_entries_set_updated_at
before update on public.tournament_entries
for each row
execute function public.set_updated_at();
