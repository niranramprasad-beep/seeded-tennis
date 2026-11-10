-- Supabase performance advisor fixes. Three real, actionable categories
-- from a fresh advisor run; a 4th ("Unused Index", INFO level) is expected
-- noise with no real users/traffic yet and is intentionally NOT addressed
-- here — do not add/drop indexes based on that category alone.
--
-- Every migration file 001 through 020 was read in full to find the FINAL,
-- currently-live form of every flagged policy (several were dropped and
-- recreated multiple times — e.g. by 010 and again by 019) before writing
-- any drop/create pair below, so nothing here accidentally reverts a later
-- fix to an earlier, superseded policy body.
--
-- NOT applied automatically — tracked in git for review and must be run by
-- hand against the real Supabase project, same discipline as every
-- migration in this project since 009.

-- ============================================================================
-- SECTION 1 — auth_rls_initplan (55 findings)
-- ============================================================================
-- Every policy below calls `auth.uid()` (or another `auth.*()` function)
-- directly inside its USING/WITH CHECK clause, which Postgres re-evaluates
-- once PER ROW instead of once per query. Wrapping the call in
-- `(select auth.*())` lets Postgres evaluate it once per query instead
-- (an "initplan"). This section changes NO security semantics — every
-- WHO-can-do-WHAT outcome is identical before and after; only HOW the
-- expression is evaluated changes.
--
-- 6 of the 55 (coach_outreach_write_own, cost_calculations_write_own,
-- daily_checkins_write_own, matches_write_own,
-- recruiting_checklist_items_write_own, tournament_entries_write_own) are
-- ALSO flagged under multiple_permissive_policies below. Rather than define
-- each of those policies twice in this one file, they are wrapped AND split
-- together in SECTION 3. That is still all 55 findings resolved by the end
-- of this file (49 here + 6 in section 3).

-- ---------------------------------------------------------------------------
-- badges (005, redefined 019)

drop policy if exists "badges_read" on public.badges;
create policy "badges_read" on public.badges
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or public.are_friends((select auth.uid()), user_id)
    or exists (select 1 from public.profiles p where p.id = user_id and p.privacy_level = 'public')
  );

drop policy if exists "badges_write_own" on public.badges;
create policy "badges_write_own" on public.badges
  for insert to authenticated
  with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- friendships (005, redefined 019)

drop policy if exists "friendships_read_involved" on public.friendships;
create policy "friendships_read_involved" on public.friendships
  for select to authenticated
  using (requester_id = (select auth.uid()) or addressee_id = (select auth.uid()));

drop policy if exists "friendships_insert_self" on public.friendships;
create policy "friendships_insert_self" on public.friendships
  for insert to authenticated
  with check (requester_id = (select auth.uid()));

drop policy if exists "friendships_update_involved" on public.friendships;
create policy "friendships_update_involved" on public.friendships
  for update to authenticated
  using (requester_id = (select auth.uid()) or addressee_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- cost_calculations: read policy only (005, redefined 019). The write
-- policy (cost_calculations_write_own) is also flagged under
-- multiple_permissive_policies — handled together in SECTION 3.

drop policy if exists "cost_calculations_read" on public.cost_calculations;
create policy "cost_calculations_read" on public.cost_calculations
  for select to authenticated
  using (user_id = (select auth.uid()) or public.is_family_member(family_code));

-- ---------------------------------------------------------------------------
-- encouragement_notes (005, redefined 019). Note:
-- encouragement_notes_read_family is NOT touched — it has no direct
-- auth.*() call (only is_family_member(family_code), whose own body
-- already wraps auth.uid() internally), so the advisor doesn't flag it.

drop policy if exists "encouragement_notes_insert_parent" on public.encouragement_notes;
create policy "encouragement_notes_insert_parent" on public.encouragement_notes
  for insert to authenticated
  with check (parent_id = (select auth.uid()) and public.is_family_member(family_code));

-- ---------------------------------------------------------------------------
-- training_plans (001; insert/update redefined by 010, then 019)

drop policy if exists "training_plans_select_own" on public.training_plans;
create policy "training_plans_select_own"
on public.training_plans for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "training_plans_delete_own" on public.training_plans;
create policy "training_plans_delete_own"
on public.training_plans for delete
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists training_plans_insert_own on public.training_plans;
create policy training_plans_insert_own on public.training_plans
  for insert to authenticated
  with check ((select auth.uid()) = user_id and public.has_tier('player'));

drop policy if exists training_plans_update_own on public.training_plans;
create policy training_plans_update_own on public.training_plans
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id and public.has_tier('player'));

-- ---------------------------------------------------------------------------
-- workout_sessions (001; insert/update redefined by 010, then 019)

drop policy if exists "workout_sessions_select_own" on public.workout_sessions;
create policy "workout_sessions_select_own"
on public.workout_sessions for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "workout_sessions_delete_own" on public.workout_sessions;
create policy "workout_sessions_delete_own"
on public.workout_sessions for delete
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists workout_sessions_insert_own on public.workout_sessions;
create policy workout_sessions_insert_own on public.workout_sessions
  for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and public.has_tier('player')
    and exists (select 1 from public.training_plans p where p.id = workout_sessions.training_plan_id and p.user_id = (select auth.uid()))
  );

drop policy if exists workout_sessions_update_own on public.workout_sessions;
create policy workout_sessions_update_own on public.workout_sessions
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and public.has_tier('player')
    and exists (select 1 from public.training_plans p where p.id = workout_sessions.training_plan_id and p.user_id = (select auth.uid()))
  );

-- ---------------------------------------------------------------------------
-- exercises (001; insert/update redefined by 010, then 019)

drop policy if exists "exercises_select_own" on public.exercises;
create policy "exercises_select_own"
on public.exercises for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "exercises_delete_own" on public.exercises;
create policy "exercises_delete_own"
on public.exercises for delete
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists exercises_insert_own on public.exercises;
create policy exercises_insert_own on public.exercises
  for insert to authenticated
  with check ((select auth.uid()) = user_id and public.has_tier('player'));

drop policy if exists exercises_update_own on public.exercises;
create policy exercises_update_own on public.exercises
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id and public.has_tier('player'));

-- ---------------------------------------------------------------------------
-- session_exercises (001; insert/update redefined by 010, then 019)

drop policy if exists "session_exercises_select_own" on public.session_exercises;
create policy "session_exercises_select_own"
on public.session_exercises for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "session_exercises_delete_own" on public.session_exercises;
create policy "session_exercises_delete_own"
on public.session_exercises for delete
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists session_exercises_insert_own on public.session_exercises;
create policy session_exercises_insert_own on public.session_exercises
  for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and public.has_tier('player')
    and exists (select 1 from public.workout_sessions s where s.id = session_exercises.workout_session_id and s.user_id = (select auth.uid()))
    and exists (select 1 from public.exercises e where e.id = session_exercises.exercise_id and e.user_id = (select auth.uid()))
  );

drop policy if exists session_exercises_update_own on public.session_exercises;
create policy session_exercises_update_own on public.session_exercises
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id and public.has_tier('player'));

-- ---------------------------------------------------------------------------
-- saved_templates (001; insert/update redefined by 010, then 019)

drop policy if exists "saved_templates_select_own" on public.saved_templates;
create policy "saved_templates_select_own"
on public.saved_templates for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "saved_templates_delete_own" on public.saved_templates;
create policy "saved_templates_delete_own"
on public.saved_templates for delete
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists saved_templates_insert_own on public.saved_templates;
create policy saved_templates_insert_own on public.saved_templates
  for insert to authenticated
  with check ((select auth.uid()) = user_id and public.has_tier('player'));

drop policy if exists saved_templates_update_own on public.saved_templates;
create policy saved_templates_update_own on public.saved_templates
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id and public.has_tier('player'));

-- ---------------------------------------------------------------------------
-- user_settings (001, never redefined)

drop policy if exists "user_settings_select_own" on public.user_settings;
create policy "user_settings_select_own"
on public.user_settings for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "user_settings_insert_own" on public.user_settings;
create policy "user_settings_insert_own"
on public.user_settings for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "user_settings_update_own" on public.user_settings;
create policy "user_settings_update_own"
on public.user_settings for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "user_settings_delete_own" on public.user_settings;
create policy "user_settings_delete_own"
on public.user_settings for delete
to authenticated
using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- utr_entries (002, never redefined). utr_entries_select_family (015) was
-- already written correctly with `(select ...)` and is intentionally NOT
-- touched here — only the 4 listed below.

drop policy if exists "utr_entries_select_own" on public.utr_entries;
create policy "utr_entries_select_own"
on public.utr_entries for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "utr_entries_insert_own" on public.utr_entries;
create policy "utr_entries_insert_own"
on public.utr_entries for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "utr_entries_update_own" on public.utr_entries;
create policy "utr_entries_update_own"
on public.utr_entries for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "utr_entries_delete_own" on public.utr_entries;
create policy "utr_entries_delete_own"
on public.utr_entries for delete
to authenticated
using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- families (001/003) — uses auth.role(), not auth.uid(); same per-row
-- re-evaluation problem, same fix.

drop policy if exists "families insertable" on public.families;
create policy "families insertable"
on public.families for insert
to authenticated
with check ((select auth.role()) = 'authenticated');

-- ---------------------------------------------------------------------------
-- recruiting_checklist_items: select policy only (016). The write policy
-- (recruiting_checklist_items_write_own) is also flagged under
-- multiple_permissive_policies — handled together in SECTION 3.

drop policy if exists recruiting_checklist_items_select_own on public.recruiting_checklist_items;
create policy recruiting_checklist_items_select_own
on public.recruiting_checklist_items for select
to authenticated
using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- coach_outreach: read policy only (009, redefined 019). The write policy
-- (coach_outreach_write_own) is also flagged under
-- multiple_permissive_policies — handled together in SECTION 3.

drop policy if exists "coach_outreach_read" on public.coach_outreach;
create policy coach_outreach_read on public.coach_outreach
  for select to authenticated
  using (user_id = (select auth.uid()) or public.is_family_member(family_code));

-- ---------------------------------------------------------------------------
-- profiles (004/005, redefined 019). family_members_read is intentionally
-- NOT touched here: it has no direct auth.*() call (only
-- current_family_code(), a SECURITY DEFINER function that already wraps
-- auth.uid() internally), so the advisor doesn't flag it.

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
on public.profiles for select
to authenticated
using ((select auth.uid()) = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
on public.profiles for insert
to authenticated
with check ((select auth.uid()) = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
on public.profiles for update
to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

drop policy if exists "profiles_discovery_read" on public.profiles;
create policy "profiles_discovery_read" on public.profiles
  for select
  to authenticated
  using (
    privacy_level = 'public'
    or id = (select auth.uid())
    or public.are_friends((select auth.uid()), id)
    or family_code = public.current_family_code()
  );

-- ---------------------------------------------------------------------------
-- family_codes (005, redefined 019)

drop policy if exists "family_codes_read_family" on public.family_codes;
create policy "family_codes_read_family" on public.family_codes
  for select to authenticated
  using (public.is_family_member(code) or player_id = (select auth.uid()));

drop policy if exists "family_codes_write_owner" on public.family_codes;
create policy "family_codes_write_owner" on public.family_codes
  for insert to authenticated
  with check (player_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- parent_accounts (005, redefined 019)

drop policy if exists "parent_accounts_read_family" on public.parent_accounts;
create policy "parent_accounts_read_family" on public.parent_accounts
  for select to authenticated
  using (user_id = (select auth.uid()) or public.is_family_member(family_code));

drop policy if exists "parent_accounts_insert_self" on public.parent_accounts;
create policy "parent_accounts_insert_self" on public.parent_accounts
  for insert to authenticated
  with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- daily_checkins: read policy only (005, redefined 019). The write policy
-- (daily_checkins_write_own) is also flagged under
-- multiple_permissive_policies — handled together in SECTION 3.

drop policy if exists "daily_checkins_read" on public.daily_checkins;
create policy "daily_checkins_read" on public.daily_checkins
  for select to authenticated
  using (user_id = (select auth.uid()) or public.is_family_member(family_code));

-- ---------------------------------------------------------------------------
-- matches: read policy only (005, redefined 019). The write policy
-- (matches_write_own) is also flagged under multiple_permissive_policies —
-- handled together in SECTION 3.

drop policy if exists "matches_read" on public.matches;
create policy "matches_read" on public.matches
  for select to authenticated
  using (user_id = (select auth.uid()) or public.is_family_member(family_code));

-- ---------------------------------------------------------------------------
-- tournament_entries: read policy only (013, redefined 019). The write
-- policy (tournament_entries_write_own) is also flagged under
-- multiple_permissive_policies — handled together in SECTION 3.

drop policy if exists tournament_entries_read on public.tournament_entries;
create policy tournament_entries_read on public.tournament_entries
  for select to authenticated
  using (user_id = (select auth.uid()) or public.is_family_member(family_code));

-- ============================================================================
-- SECTION 2 — unindexed_foreign_keys (14 findings)
-- ============================================================================
-- Plain btree index on each flagged FK column. (Does not touch the
-- advisor's separate "Unused Index" INFO-level findings — those are
-- expected noise with no real users/traffic yet.)

create index if not exists budget_expenses_created_by_idx on public.budget_expenses (created_by);
create index if not exists cost_calculations_family_code_idx on public.cost_calculations (family_code);
create index if not exists cost_calculations_user_id_idx on public.cost_calculations (user_id);
create index if not exists daily_checkins_family_code_idx on public.daily_checkins (family_code);
create index if not exists encouragement_notes_family_code_idx on public.encouragement_notes (family_code);
create index if not exists encouragement_notes_parent_id_idx on public.encouragement_notes (parent_id);
create index if not exists encouragement_notes_player_id_idx on public.encouragement_notes (player_id);
create index if not exists family_codes_player_id_idx on public.family_codes (player_id);
create index if not exists matches_family_code_idx on public.matches (family_code);
create index if not exists parent_accounts_player_id_idx on public.parent_accounts (player_id);
create index if not exists parent_reports_player_id_idx on public.parent_reports (player_id);
create index if not exists season_budgets_updated_by_idx on public.season_budgets (updated_by);
create index if not exists session_exercises_exercise_id_idx on public.session_exercises (exercise_id);
create index if not exists tournament_entries_user_id_idx on public.tournament_entries (user_id);

-- ============================================================================
-- SECTION 3 — multiple_permissive_policies (10 findings)
-- ============================================================================
-- Each table below has a dedicated `_read`-style SELECT policy AND a
-- separate FOR ALL / `_write_own` policy that also (redundantly) covers
-- SELECT, so Postgres evaluates both permissive policies on every read.
-- Fix: split each FOR ALL policy into FOR INSERT / FOR UPDATE / FOR DELETE
-- (dropping the SELECT it implicitly covered) — the existing `_read` policy
-- already covers SELECT, so nothing is lost. USING/WITH CHECK logic is
-- reproduced exactly, just decomposed per command: an UPDATE policy keeps
-- both USING (which rows qualify) and WITH CHECK (what the new row must
-- satisfy); INSERT only ever needed WITH CHECK; DELETE only ever needed
-- USING. This mirrors exactly how Postgres already evaluated the single
-- FOR ALL policy per command type, so behavior is unchanged.
--
-- 6 of these 8 fixed below are ALSO flagged under SECTION 1's
-- auth_rls_initplan list (coach_outreach_write_own,
-- cost_calculations_write_own, daily_checkins_write_own, matches_write_own,
-- recruiting_checklist_items_write_own, tournament_entries_write_own) — the
-- auth.uid() wrap is applied together with the split below instead of
-- defining the policy twice in this file.
--
-- SKIPPED, explicitly, as instructed — not guessed at:
--   - profiles: the 3-way overlap between family_members_read /
--     profiles_discovery_read / profiles_select_own is NOT a write-policy
--     redundancy — all three are separate, intentional SELECT policies with
--     distinct real purposes (own-row access, family-code sharing, and
--     public/friends/family discovery). Consolidating them into fewer
--     policies would require proving the merged boolean expression is
--     exactly equivalent for every role/row combination; that is not a
--     confident call to make here, so this specific case is left alone.
--   - utr_entries: utr_entries_select_family (parent/family-member read)
--     and utr_entries_select_own (owner read) are two intentionally
--     separate SELECT policies by design (one per audience) — a correct
--     multi-policy pattern, not a bug. Left alone.

-- ---------------------------------------------------------------------------
-- budget_expenses (015) — no direct auth.*() call in the original
-- (is_parent_member already wraps auth.uid() internally), so this is a
-- SECTION-3-only fix; not part of SECTION 1's count.

drop policy if exists budget_expenses_write on public.budget_expenses;

create policy budget_expenses_write_insert on public.budget_expenses
  for insert to authenticated
  with check (public.is_parent_member(family_code));

create policy budget_expenses_write_update on public.budget_expenses
  for update to authenticated
  using (public.is_parent_member(family_code))
  with check (public.is_parent_member(family_code));

create policy budget_expenses_write_delete on public.budget_expenses
  for delete to authenticated
  using (public.is_parent_member(family_code));

-- ---------------------------------------------------------------------------
-- season_budgets (015) — same as budget_expenses: SECTION-3-only fix.

drop policy if exists season_budgets_write on public.season_budgets;

create policy season_budgets_write_insert on public.season_budgets
  for insert to authenticated
  with check (public.is_parent_member(family_code));

create policy season_budgets_write_update on public.season_budgets
  for update to authenticated
  using (public.is_parent_member(family_code))
  with check (public.is_parent_member(family_code));

create policy season_budgets_write_delete on public.season_budgets
  for delete to authenticated
  using (public.is_parent_member(family_code));

-- ---------------------------------------------------------------------------
-- coach_outreach_write_own (009, redefined 010/019) — also in SECTION 1's
-- initplan list; wrap + split applied together. USING and WITH CHECK are
-- asymmetric in the original (USING has no tier gate; WITH CHECK adds
-- has_tier('family')) — preserved exactly, decomposed per command.

drop policy if exists "coach_outreach_write_own" on public.coach_outreach;

create policy coach_outreach_write_own_insert on public.coach_outreach
  for insert to authenticated
  with check (user_id = (select auth.uid()) and public.has_tier('family'));

create policy coach_outreach_write_own_update on public.coach_outreach
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and public.has_tier('family'));

create policy coach_outreach_write_own_delete on public.coach_outreach
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- cost_calculations_write_own (005, redefined 019) — also in SECTION 1's
-- initplan list; wrap + split applied together.

drop policy if exists "cost_calculations_write_own" on public.cost_calculations;

create policy cost_calculations_write_own_insert on public.cost_calculations
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy cost_calculations_write_own_update on public.cost_calculations
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy cost_calculations_write_own_delete on public.cost_calculations
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- daily_checkins_write_own (005, redefined 019) — also in SECTION 1's
-- initplan list; wrap + split applied together.

drop policy if exists "daily_checkins_write_own" on public.daily_checkins;

create policy daily_checkins_write_own_insert on public.daily_checkins
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy daily_checkins_write_own_update on public.daily_checkins
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy daily_checkins_write_own_delete on public.daily_checkins
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- matches_write_own (005, redefined 019) — also in SECTION 1's initplan
-- list; wrap + split applied together.

drop policy if exists "matches_write_own" on public.matches;

create policy matches_write_own_insert on public.matches
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy matches_write_own_update on public.matches
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy matches_write_own_delete on public.matches
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- recruiting_checklist_items_write_own (016) — also in SECTION 1's
-- initplan list; wrap + split applied together.

drop policy if exists recruiting_checklist_items_write_own on public.recruiting_checklist_items;

create policy recruiting_checklist_items_write_own_insert on public.recruiting_checklist_items
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy recruiting_checklist_items_write_own_update on public.recruiting_checklist_items
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy recruiting_checklist_items_write_own_delete on public.recruiting_checklist_items
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- tournament_entries_write_own (013, redefined 019) — also in SECTION 1's
-- initplan list; wrap + split applied together.

drop policy if exists tournament_entries_write_own on public.tournament_entries;

create policy tournament_entries_write_own_insert on public.tournament_entries
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy tournament_entries_write_own_update on public.tournament_entries
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy tournament_entries_write_own_delete on public.tournament_entries
  for delete to authenticated
  using (user_id = (select auth.uid()));
