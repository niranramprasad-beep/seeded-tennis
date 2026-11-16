-- RLS review (this task's item 5) — read every `create table` / `alter
-- table ... enable row level security` / `create policy` statement across
-- all 18 migrations. Two real problems found, fixed below:
--
-- PROBLEM 1 — systemic: missing `to authenticated` role scoping.
-- 001_initial_saas_schema.sql wrote its policies with an explicit
-- `to authenticated` clause. Nearly every migration AFTER it that added a
-- brand-new policy, OR dropped-and-recreated an existing one, wrote
-- `create policy ... using (...)` with NO `to` clause at all — which
-- Postgres defaults to PUBLIC (every role, including `anon`). This affects
-- 004 (profiles' 3 own-row policies + family_members_read), 005 (every
-- policy it adds: profiles_discovery_read, family_codes, parent_accounts,
-- daily_checkins, matches, badges, friendships, cost_calculations,
-- parent_reports, encouragement_notes, and the two match-videos storage
-- policies), 009 (coach_outreach), 010 (every *_insert_own/_update_own it
-- redefines, re-dropping the `to authenticated` 001 had on several of
-- them), 013 (tournament_entries), and 015 (season_budgets,
-- budget_expenses — utr_entries_select_family in this same file got it
-- right, for comparison).
--
-- Today this is mostly NOT independently exploitable (the USING clauses
-- all key off `auth.uid()`, which is NULL for anon, so most of these
-- quietly return zero rows for an anon caller instead of leaking data) —
-- but it is a real, necessary fix for a different reason: migration
-- 018_revoke_anon_execute_security_definer.sql revokes anon's EXECUTE on
-- is_family_member()/are_friends()/current_family_code()/has_tier(). Any
-- policy that calls one of those functions AND isn't scoped `to
-- authenticated` is still EVALUATED for an anon query (because it applies
-- to PUBLIC), which would now raise "permission denied for function ..."
-- — turning today's silent-empty-result behavior into a hard 500 for any
-- anon request against these tables. 018 and 019 must be applied together
-- (019 can safely go first; 018 cannot safely go without 019).
--
-- PROBLEM 2 — real, substantive: season_budgets/budget_expenses are
-- writable by ANY family member, not just parents. lib/db/family.ts's
-- doc comments for saveSeasonBudget and saveBudgetExpense both say this is
-- "parent-owned data, never a player-owned field" — but
-- season_budgets_write and budget_expenses_write (015) both use
-- `is_family_member(family_code)` for their WITH CHECK, which is true for
-- a PLAYER on the family too. A signed-in player could currently call the
-- Supabase REST API directly (the publishable key is public) and edit
-- their own family's season budget or insert budget_expenses rows,
-- contradicting the product's own stated rule. Fixed below with a new
-- `is_parent_member()` helper (mirrors is_family_member(), adds
-- `role = 'parent'`) used only for the WRITE policies — READ stays
-- `is_family_member()` (both roles read, matching "parents get read-only
-- access to family data" — the player needs to read season budget just
-- as much as the parent does).
--
-- Every other table's write-ownership was reviewed and found correct for
-- the "player writes own row; parent reads family-scoped rows read-only;
-- school/catalog data (not in this database — static in lib/db/schools.ts)
-- is public-read" rule: utr_entries, matches, daily_checkins,
-- cost_calculations, coach_outreach, tournament_entries, training_plans/
-- workout_sessions/exercises/session_exercises/saved_templates,
-- user_settings, recruiting_checklist_items all restrict every write
-- policy to `auth.uid() = user_id`, with family-read (where applicable)
-- granted separately and never extended to write.
--
-- NOT applied automatically — tracked in git for review and must be run
-- by hand against the real Supabase project, same discipline as every
-- migration in this project since 009. Apply together with 018.

-- ---------------------------------------------------------------------------
-- new helper for PROBLEM 2 — mirrors is_family_member() (005) but also
-- requires the caller's own role to be 'parent'.
create or replace function public.is_parent_member(target_family_code text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.family_code = target_family_code and p.role = 'parent'
  )
$$;

revoke execute on function public.is_parent_member(text) from anon;

-- ---------------------------------------------------------------------------
-- profiles (004, 005)

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
on public.profiles for select
to authenticated
using (auth.uid() = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
on public.profiles for insert
to authenticated
with check (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
on public.profiles for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

drop policy if exists "family_members_read" on public.profiles;
create policy "family_members_read" on public.profiles
  for select
  to authenticated
  using (
    family_code is not null
    and family_code = public.current_family_code()
  );

drop policy if exists "profiles_discovery_read" on public.profiles;
create policy "profiles_discovery_read" on public.profiles
  for select
  to authenticated
  using (
    privacy_level = 'public'
    or id = auth.uid()
    or public.are_friends(auth.uid(), id)
    or family_code = public.current_family_code()
  );

-- ---------------------------------------------------------------------------
-- family_codes, parent_accounts (005)

drop policy if exists "family_codes_read_family" on public.family_codes;
create policy "family_codes_read_family" on public.family_codes
  for select to authenticated
  using (public.is_family_member(code) or player_id = auth.uid());

drop policy if exists "family_codes_write_owner" on public.family_codes;
create policy "family_codes_write_owner" on public.family_codes
  for insert to authenticated
  with check (player_id = auth.uid());

drop policy if exists "parent_accounts_read_family" on public.parent_accounts;
create policy "parent_accounts_read_family" on public.parent_accounts
  for select to authenticated
  using (user_id = auth.uid() or public.is_family_member(family_code));

drop policy if exists "parent_accounts_insert_self" on public.parent_accounts;
create policy "parent_accounts_insert_self" on public.parent_accounts
  for insert to authenticated
  with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- daily_checkins, matches (005)

drop policy if exists "daily_checkins_read" on public.daily_checkins;
create policy "daily_checkins_read" on public.daily_checkins
  for select to authenticated
  using (user_id = auth.uid() or public.is_family_member(family_code));

drop policy if exists "daily_checkins_write_own" on public.daily_checkins;
create policy "daily_checkins_write_own" on public.daily_checkins
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "matches_read" on public.matches;
create policy "matches_read" on public.matches
  for select to authenticated
  using (user_id = auth.uid() or public.is_family_member(family_code));

drop policy if exists "matches_write_own" on public.matches;
create policy "matches_write_own" on public.matches
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- badges, friendships (005)

drop policy if exists "badges_read" on public.badges;
create policy "badges_read" on public.badges
  for select to authenticated
  using (
    user_id = auth.uid()
    or public.are_friends(auth.uid(), user_id)
    or exists (select 1 from public.profiles p where p.id = user_id and p.privacy_level = 'public')
  );

drop policy if exists "badges_write_own" on public.badges;
create policy "badges_write_own" on public.badges
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "friendships_read_involved" on public.friendships;
create policy "friendships_read_involved" on public.friendships
  for select to authenticated
  using (requester_id = auth.uid() or addressee_id = auth.uid());

drop policy if exists "friendships_insert_self" on public.friendships;
create policy "friendships_insert_self" on public.friendships
  for insert to authenticated
  with check (requester_id = auth.uid());

drop policy if exists "friendships_update_involved" on public.friendships;
create policy "friendships_update_involved" on public.friendships
  for update to authenticated
  using (requester_id = auth.uid() or addressee_id = auth.uid());

-- ---------------------------------------------------------------------------
-- cost_calculations, parent_reports, encouragement_notes (005)

drop policy if exists "cost_calculations_read" on public.cost_calculations;
create policy "cost_calculations_read" on public.cost_calculations
  for select to authenticated
  using (user_id = auth.uid() or public.is_family_member(family_code));

drop policy if exists "cost_calculations_write_own" on public.cost_calculations;
create policy "cost_calculations_write_own" on public.cost_calculations
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "parent_reports_read_family" on public.parent_reports;
create policy "parent_reports_read_family" on public.parent_reports
  for select to authenticated
  using (public.is_family_member(family_code));

drop policy if exists "parent_reports_service_insert" on public.parent_reports;
create policy "parent_reports_service_insert" on public.parent_reports
  for insert to authenticated
  with check (public.is_family_member(family_code));

drop policy if exists "encouragement_notes_read_family" on public.encouragement_notes;
create policy "encouragement_notes_read_family" on public.encouragement_notes
  for select to authenticated
  using (public.is_family_member(family_code));

drop policy if exists "encouragement_notes_insert_parent" on public.encouragement_notes;
create policy "encouragement_notes_insert_parent" on public.encouragement_notes
  for insert to authenticated
  with check (parent_id = auth.uid() and public.is_family_member(family_code));

-- ---------------------------------------------------------------------------
-- match-videos storage (005) — same missing-`to authenticated` gap; no
-- SECURITY DEFINER function involved, but anon has no legitimate reason to
-- have these evaluated for it either.

drop policy if exists "match_videos_owner_upload" on storage.objects;
create policy "match_videos_owner_upload" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'match-videos' and auth.uid()::text = (storage.foldername(name))[1]);

drop policy if exists "match_videos_owner_read" on storage.objects;
create policy "match_videos_owner_read" on storage.objects
  for select to authenticated
  using (bucket_id = 'match-videos' and auth.uid()::text = (storage.foldername(name))[1]);

-- ---------------------------------------------------------------------------
-- coach_outreach (009, redefined by 010)

drop policy if exists "coach_outreach_read" on public.coach_outreach;
create policy coach_outreach_read on public.coach_outreach
  for select to authenticated
  using (user_id = auth.uid() or public.is_family_member(family_code));

drop policy if exists "coach_outreach_write_own" on public.coach_outreach;
create policy coach_outreach_write_own on public.coach_outreach
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.has_tier('family'));

-- ---------------------------------------------------------------------------
-- training_plans / workout_sessions / exercises / session_exercises /
-- saved_templates insert+update policies (010 dropped the `to
-- authenticated` 001 had on all of these when it redefined them to add
-- has_tier()).

drop policy if exists training_plans_insert_own on public.training_plans;
create policy training_plans_insert_own on public.training_plans
  for insert to authenticated
  with check (auth.uid() = user_id and public.has_tier('player'));

drop policy if exists training_plans_update_own on public.training_plans;
create policy training_plans_update_own on public.training_plans
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id and public.has_tier('player'));

drop policy if exists workout_sessions_insert_own on public.workout_sessions;
create policy workout_sessions_insert_own on public.workout_sessions
  for insert to authenticated
  with check (
    auth.uid() = user_id
    and public.has_tier('player')
    and exists (select 1 from public.training_plans p where p.id = workout_sessions.training_plan_id and p.user_id = auth.uid())
  );

drop policy if exists workout_sessions_update_own on public.workout_sessions;
create policy workout_sessions_update_own on public.workout_sessions
  for update to authenticated
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and public.has_tier('player')
    and exists (select 1 from public.training_plans p where p.id = workout_sessions.training_plan_id and p.user_id = auth.uid())
  );

drop policy if exists exercises_insert_own on public.exercises;
create policy exercises_insert_own on public.exercises
  for insert to authenticated
  with check (auth.uid() = user_id and public.has_tier('player'));

drop policy if exists exercises_update_own on public.exercises;
create policy exercises_update_own on public.exercises
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id and public.has_tier('player'));

drop policy if exists session_exercises_insert_own on public.session_exercises;
create policy session_exercises_insert_own on public.session_exercises
  for insert to authenticated
  with check (
    auth.uid() = user_id
    and public.has_tier('player')
    and exists (select 1 from public.workout_sessions s where s.id = session_exercises.workout_session_id and s.user_id = auth.uid())
    and exists (select 1 from public.exercises e where e.id = session_exercises.exercise_id and e.user_id = auth.uid())
  );

drop policy if exists session_exercises_update_own on public.session_exercises;
create policy session_exercises_update_own on public.session_exercises
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id and public.has_tier('player'));

drop policy if exists saved_templates_insert_own on public.saved_templates;
create policy saved_templates_insert_own on public.saved_templates
  for insert to authenticated
  with check (auth.uid() = user_id and public.has_tier('player'));

drop policy if exists saved_templates_update_own on public.saved_templates;
create policy saved_templates_update_own on public.saved_templates
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id and public.has_tier('player'));

-- ---------------------------------------------------------------------------
-- tournament_entries (013)

drop policy if exists tournament_entries_read on public.tournament_entries;
create policy tournament_entries_read on public.tournament_entries
  for select to authenticated
  using (user_id = auth.uid() or public.is_family_member(family_code));

drop policy if exists tournament_entries_write_own on public.tournament_entries;
create policy tournament_entries_write_own on public.tournament_entries
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- season_budgets, budget_expenses (015) — PROBLEM 2: write restricted to
-- parents only, matching lib/db/family.ts's documented "parent-owned,
-- never player-owned" rule. Read stays open to the whole family (both
-- roles need to see the budget).

drop policy if exists season_budgets_read on public.season_budgets;
create policy season_budgets_read on public.season_budgets
  for select to authenticated
  using (public.is_family_member(family_code));

drop policy if exists season_budgets_write on public.season_budgets;
create policy season_budgets_write on public.season_budgets
  for all to authenticated
  using (public.is_parent_member(family_code))
  with check (public.is_parent_member(family_code));

drop policy if exists budget_expenses_read on public.budget_expenses;
create policy budget_expenses_read on public.budget_expenses
  for select to authenticated
  using (public.is_family_member(family_code));

drop policy if exists budget_expenses_write on public.budget_expenses;
create policy budget_expenses_write on public.budget_expenses
  for all to authenticated
  using (public.is_parent_member(family_code))
  with check (public.is_parent_member(family_code));
