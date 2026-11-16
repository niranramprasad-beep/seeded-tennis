-- Real backing for /family's Seeded rebuild (pixel-exact to
-- "18 Parent view + budget.png"). Two things this adds:
--
-- 1) A read-only RLS widening on `utr_entries`. Every other family-shared
--    table in this app (daily_checkins, matches, cost_calculations,
--    coach_outreach, tournament_entries) already lets a parent read rows
--    scoped to `family_code`. `utr_entries` never got that treatment — its
--    only policy (migration 002_utr_entries.sql) is strictly
--    `auth.uid() = user_id`, so a parent session calling loadUtrEntries()
--    for the real "+0.51 since May" UTR-delta stat on /family would always
--    get back []. `utr_entries` has no `family_code` column of its own
--    (unlike the tables above), so this policy checks family membership by
--    joining to the row owner's `profiles.family_code` instead — reusing
--    `current_family_code()` (migration 004_fix_profiles_recursion.sql),
--    the same non-recursive helper `profiles`' own family-read policy
--    already uses. Purely additive (a second permissive SELECT policy,
--    OR'd with the existing one) — nothing about who can WRITE utr_entries
--    changes, and the player's own access is untouched.
--
-- 2) Two new tables backing the "Season budget" card, which has no real
--    home anywhere before this. The existing cost calculator
--    (lib/supabase/features.ts's CostInputs/CostResults/
--    saveCostCalculation, still reachable from /family/budget) is a
--    lifetime PROJECTION tool (coaching hours x lesson rate x years, etc) —
--    it has never tracked a season-to-date spend total or a real per-event
--    expense log, so it can't back this card's $-spent-of-$-budgeted
--    progress bar or its date/event/fit/cost table.
--
--      `season_budgets` — one editable total per family (parent-set via
--      "Edit budget"). `family_code`-scoped and unique per family (not
--      user_id-scoped like the `user_settings` JSONB-bag pattern
--      lib/supabase/settings-prefs.ts uses) because the mockup's "Invite
--      another parent" box implies more than one parent account can share
--      one family's budget.
--
--      `budget_expenses` — freeform costs a parent logs via "Add expense"
--      that aren't a scored tournament entry (camps, gear, anything else).
--      Real per-event tournament spend (the "Entries"/"Travel" rows,
--      fit-scored live via lib/tournament-fit.ts's evaluateTournamentFit)
--      comes from the ALREADY-REAL `tournament_entries` table (migration
--      013) — this table only needs to cover the gap: category is
--      restricted to ('entries','travel','camps') to match exactly the 3
--      categories the budget card's spend breakdown shows, so every
--      logged dollar lands in one of those 3 buckets with no leftover
--      "other" bucket the UI has nowhere to put.
--
-- NOT applied automatically — tracked in git for review and must be run by
-- hand against the real (shared dev/prod) Supabase project, same
-- discipline as 009/011/013/014.

drop policy if exists "utr_entries_select_family" on public.utr_entries;
create policy "utr_entries_select_family"
on public.utr_entries for select
to authenticated
using (
  exists (
    select 1 from public.profiles owner
    where owner.id = utr_entries.user_id
      and owner.family_code is not null
      and owner.family_code = public.current_family_code()
  )
);

create table public.season_budgets (
  id uuid primary key default gen_random_uuid(),
  family_code text not null unique,
  season_label text not null default 'This season',
  total_budget numeric(9, 2) not null default 0 check (total_budget >= 0),
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.season_budgets enable row level security;

create policy season_budgets_read on public.season_budgets
  for select
  using (is_family_member(family_code));

create policy season_budgets_write on public.season_budgets
  for all
  using (is_family_member(family_code))
  with check (is_family_member(family_code));

drop trigger if exists season_budgets_set_updated_at on public.season_budgets;
create trigger season_budgets_set_updated_at
before update on public.season_budgets
for each row
execute function public.set_updated_at();

create table public.budget_expenses (
  id uuid primary key default gen_random_uuid(),
  family_code text not null,
  created_by uuid not null references public.profiles(id) on delete cascade,
  category text not null check (category in ('entries', 'travel', 'camps')),
  label text not null,
  amount numeric(8, 2) not null check (amount >= 0),
  expense_date date not null default current_date,
  created_at timestamptz not null default now()
);

alter table public.budget_expenses enable row level security;

create policy budget_expenses_read on public.budget_expenses
  for select
  using (is_family_member(family_code));

create policy budget_expenses_write on public.budget_expenses
  for all
  using (is_family_member(family_code))
  with check (is_family_member(family_code));

create index if not exists budget_expenses_family_date_idx
on public.budget_expenses (family_code, expense_date desc);
