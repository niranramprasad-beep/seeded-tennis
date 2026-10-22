-- Mirrors the client-side PaidGate: roadmap/training require "player",
-- coach outreach requires "family". Previously only row ownership was
-- checked, so a signed-in free user could call Supabase directly (the
-- anon key is public) and write into these tables, bypassing the paywall
-- entirely. This only gates the write path (insert/update) — a user who
-- downgrades keeps read access to data they already created while paid,
-- matching standard SaaS downgrade behavior; they just can't create more.
create or replace function public.has_tier(required_tier text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when required_tier = 'free' then true
    else exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and (
          (required_tier = 'player' and p.subscription_tier in ('player', 'family'))
          or (required_tier = 'family' and p.subscription_tier = 'family')
        )
    )
  end
$$;

-- training_plans (player tier)
drop policy if exists training_plans_insert_own on public.training_plans;
create policy training_plans_insert_own on public.training_plans
  for insert
  with check (auth.uid() = user_id and has_tier('player'));

drop policy if exists training_plans_update_own on public.training_plans;
create policy training_plans_update_own on public.training_plans
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id and has_tier('player'));

-- workout_sessions (player tier)
drop policy if exists workout_sessions_insert_own on public.workout_sessions;
create policy workout_sessions_insert_own on public.workout_sessions
  for insert
  with check (
    auth.uid() = user_id
    and has_tier('player')
    and exists (select 1 from public.training_plans p where p.id = workout_sessions.training_plan_id and p.user_id = auth.uid())
  );

drop policy if exists workout_sessions_update_own on public.workout_sessions;
create policy workout_sessions_update_own on public.workout_sessions
  for update
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and has_tier('player')
    and exists (select 1 from public.training_plans p where p.id = workout_sessions.training_plan_id and p.user_id = auth.uid())
  );

-- exercises (player tier)
drop policy if exists exercises_insert_own on public.exercises;
create policy exercises_insert_own on public.exercises
  for insert
  with check (auth.uid() = user_id and has_tier('player'));

drop policy if exists exercises_update_own on public.exercises;
create policy exercises_update_own on public.exercises
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id and has_tier('player'));

-- session_exercises (player tier)
drop policy if exists session_exercises_insert_own on public.session_exercises;
create policy session_exercises_insert_own on public.session_exercises
  for insert
  with check (
    auth.uid() = user_id
    and has_tier('player')
    and exists (select 1 from public.workout_sessions s where s.id = session_exercises.workout_session_id and s.user_id = auth.uid())
    and exists (select 1 from public.exercises e where e.id = session_exercises.exercise_id and e.user_id = auth.uid())
  );

drop policy if exists session_exercises_update_own on public.session_exercises;
create policy session_exercises_update_own on public.session_exercises
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id and has_tier('player'));

-- saved_templates (player tier)
drop policy if exists saved_templates_insert_own on public.saved_templates;
create policy saved_templates_insert_own on public.saved_templates
  for insert
  with check (auth.uid() = user_id and has_tier('player'));

drop policy if exists saved_templates_update_own on public.saved_templates;
create policy saved_templates_update_own on public.saved_templates
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id and has_tier('player'));

-- coach_outreach (family tier)
drop policy if exists coach_outreach_write_own on public.coach_outreach;
create policy coach_outreach_write_own on public.coach_outreach
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and has_tier('family'));
