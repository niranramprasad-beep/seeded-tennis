-- Support the full UTR scale (1.00 - 16.50) everywhere.
-- Earlier migrations capped ratings at 16, which rejected legitimate values
-- like 16.2. Also bounds opponent UTRs on matches, which were unconstrained.

alter table public.profiles
  drop constraint if exists profiles_current_utr_check;
alter table public.profiles
  add constraint profiles_current_utr_check
  check (current_utr is null or current_utr between 1 and 16.5);

alter table public.utr_entries
  drop constraint if exists utr_entries_utr_check;
alter table public.utr_entries
  add constraint utr_entries_utr_check
  check (utr between 1 and 16.5);

alter table public.matches
  drop constraint if exists matches_opponent_utr_check;
alter table public.matches
  add constraint matches_opponent_utr_check
  check (opponent_utr is null or opponent_utr between 1 and 16.5);
