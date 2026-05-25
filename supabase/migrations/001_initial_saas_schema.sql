-- Seeded production SaaS schema
-- Apply this migration in Supabase after creating the project.
-- It is intentionally additive/idempotent so it can follow the older 0001_init.sql.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- shared timestamp trigger

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- families

create table if not exists public.families (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  name text,
  created_at timestamptz not null default now()
);

alter table public.families enable row level security;

drop policy if exists "families readable" on public.families;
drop policy if exists "families insertable" on public.families;

create policy "families readable"
on public.families for select
to authenticated
using (true);

create policy "families insertable"
on public.families for insert
to authenticated
with check (auth.role() = 'authenticated');

-- ---------------------------------------------------------------------------
-- profiles

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  name text not null default '',
  country text,
  gender text check (gender in ('male', 'female')),
  grade integer check (grade between 1 and 12),
  role text not null default 'player' check (role in ('player', 'parent')),
  family_code text,
  current_utr numeric(4,2) check (current_utr between 1 and 16),
  graduation_year integer,
  commitment_date date,
  target_school_slugs text[] not null default '{}',
  weaknesses text[] not null default '{}',
  tournaments_played integer not null default 0 check (tournaments_played >= 0),
  tournaments_goal integer not null default 12 check (tournaments_goal >= 0),
  onboarded boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles add column if not exists family_code text;
alter table public.profiles add column if not exists updated_at timestamptz not null default now();
alter table public.profiles add column if not exists commitment_date date;
alter table public.profiles add column if not exists tournaments_played integer not null default 0;
alter table public.profiles add column if not exists tournaments_goal integer not null default 12;
alter table public.profiles add column if not exists onboarded boolean not null default false;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_family_code_fkey'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_family_code_fkey
      foreign key (family_code)
      references public.families (code);
  end if;
end $$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row
execute function public.set_updated_at();

alter table public.profiles enable row level security;

drop policy if exists "own profile read" on public.profiles;
drop policy if exists "own profile upsert" on public.profiles;
drop policy if exists "own profile update" on public.profiles;
drop policy if exists "profiles_select_own" on public.profiles;
drop policy if exists "profiles_insert_own" on public.profiles;
drop policy if exists "profiles_update_own" on public.profiles;

create policy "profiles_select_own"
on public.profiles for select
to authenticated
using (auth.uid() = id);

create policy "profiles_insert_own"
on public.profiles for insert
to authenticated
with check (auth.uid() = id);

create policy "profiles_update_own"
on public.profiles for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

create index if not exists profiles_family_code_idx on public.profiles (family_code);

-- ---------------------------------------------------------------------------
-- training plans

create table if not exists public.training_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  goal text,
  active boolean not null default false,
  source text not null default 'custom' check (source in ('custom', 'seeded', 'template')),
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists training_plans_set_updated_at on public.training_plans;
create trigger training_plans_set_updated_at
before update on public.training_plans
for each row
execute function public.set_updated_at();

alter table public.training_plans enable row level security;

create index if not exists training_plans_user_id_idx on public.training_plans (user_id);
create index if not exists training_plans_user_active_idx on public.training_plans (user_id, active);

drop policy if exists "training_plans_select_own" on public.training_plans;
drop policy if exists "training_plans_insert_own" on public.training_plans;
drop policy if exists "training_plans_update_own" on public.training_plans;
drop policy if exists "training_plans_delete_own" on public.training_plans;

create policy "training_plans_select_own"
on public.training_plans for select
to authenticated
using (auth.uid() = user_id);

create policy "training_plans_insert_own"
on public.training_plans for insert
to authenticated
with check (auth.uid() = user_id);

create policy "training_plans_update_own"
on public.training_plans for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "training_plans_delete_own"
on public.training_plans for delete
to authenticated
using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- workout sessions

create table if not exists public.workout_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  training_plan_id uuid not null references public.training_plans (id) on delete cascade,
  title text not null,
  session_type text not null,
  scheduled_date date,
  weekday text check (weekday in ('Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun')),
  start_time time,
  duration_minutes integer not null default 60 check (duration_minutes > 0),
  intensity text not null default 'moderate' check (intensity in ('low', 'moderate', 'high')),
  notes text,
  goals text,
  completed boolean not null default false,
  order_index integer not null default 0,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists workout_sessions_set_updated_at on public.workout_sessions;
create trigger workout_sessions_set_updated_at
before update on public.workout_sessions
for each row
execute function public.set_updated_at();

alter table public.workout_sessions enable row level security;

create index if not exists workout_sessions_user_id_idx on public.workout_sessions (user_id);
create index if not exists workout_sessions_plan_idx on public.workout_sessions (training_plan_id);
create index if not exists workout_sessions_date_idx on public.workout_sessions (user_id, scheduled_date);

drop policy if exists "workout_sessions_select_own" on public.workout_sessions;
drop policy if exists "workout_sessions_insert_own" on public.workout_sessions;
drop policy if exists "workout_sessions_update_own" on public.workout_sessions;
drop policy if exists "workout_sessions_delete_own" on public.workout_sessions;

create policy "workout_sessions_select_own"
on public.workout_sessions for select
to authenticated
using (auth.uid() = user_id);

create policy "workout_sessions_insert_own"
on public.workout_sessions for insert
to authenticated
with check (
  auth.uid() = user_id
  and exists (
    select 1 from public.training_plans p
    where p.id = training_plan_id and p.user_id = auth.uid()
  )
);

create policy "workout_sessions_update_own"
on public.workout_sessions for update
to authenticated
using (auth.uid() = user_id)
with check (
  auth.uid() = user_id
  and exists (
    select 1 from public.training_plans p
    where p.id = training_plan_id and p.user_id = auth.uid()
  )
);

create policy "workout_sessions_delete_own"
on public.workout_sessions for delete
to authenticated
using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- exercises and session exercises

create table if not exists public.exercises (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  exercise_type text,
  description text,
  default_duration_minutes integer check (default_duration_minutes is null or default_duration_minutes > 0),
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name)
);

drop trigger if exists exercises_set_updated_at on public.exercises;
create trigger exercises_set_updated_at
before update on public.exercises
for each row
execute function public.set_updated_at();

alter table public.exercises enable row level security;

create index if not exists exercises_user_id_idx on public.exercises (user_id);

drop policy if exists "exercises_select_own" on public.exercises;
drop policy if exists "exercises_insert_own" on public.exercises;
drop policy if exists "exercises_update_own" on public.exercises;
drop policy if exists "exercises_delete_own" on public.exercises;

create policy "exercises_select_own"
on public.exercises for select
to authenticated
using (auth.uid() = user_id);

create policy "exercises_insert_own"
on public.exercises for insert
to authenticated
with check (auth.uid() = user_id);

create policy "exercises_update_own"
on public.exercises for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "exercises_delete_own"
on public.exercises for delete
to authenticated
using (auth.uid() = user_id);

create table if not exists public.session_exercises (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  workout_session_id uuid not null references public.workout_sessions (id) on delete cascade,
  exercise_id uuid not null references public.exercises (id) on delete cascade,
  order_index integer not null default 0,
  sets integer,
  reps text,
  duration_minutes integer,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workout_session_id, exercise_id, order_index)
);

drop trigger if exists session_exercises_set_updated_at on public.session_exercises;
create trigger session_exercises_set_updated_at
before update on public.session_exercises
for each row
execute function public.set_updated_at();

alter table public.session_exercises enable row level security;

create index if not exists session_exercises_user_id_idx on public.session_exercises (user_id);
create index if not exists session_exercises_session_idx on public.session_exercises (workout_session_id);

drop policy if exists "session_exercises_select_own" on public.session_exercises;
drop policy if exists "session_exercises_insert_own" on public.session_exercises;
drop policy if exists "session_exercises_update_own" on public.session_exercises;
drop policy if exists "session_exercises_delete_own" on public.session_exercises;

create policy "session_exercises_select_own"
on public.session_exercises for select
to authenticated
using (auth.uid() = user_id);

create policy "session_exercises_insert_own"
on public.session_exercises for insert
to authenticated
with check (
  auth.uid() = user_id
  and exists (
    select 1 from public.workout_sessions s
    where s.id = workout_session_id and s.user_id = auth.uid()
  )
  and exists (
    select 1 from public.exercises e
    where e.id = exercise_id and e.user_id = auth.uid()
  )
);

create policy "session_exercises_update_own"
on public.session_exercises for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "session_exercises_delete_own"
on public.session_exercises for delete
to authenticated
using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- saved templates

create table if not exists public.saved_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  template_type text not null default 'session' check (template_type in ('session', 'plan')),
  description text,
  payload jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists saved_templates_set_updated_at on public.saved_templates;
create trigger saved_templates_set_updated_at
before update on public.saved_templates
for each row
execute function public.set_updated_at();

alter table public.saved_templates enable row level security;

create index if not exists saved_templates_user_id_idx on public.saved_templates (user_id);
create index if not exists saved_templates_user_type_idx on public.saved_templates (user_id, template_type);

drop policy if exists "saved_templates_select_own" on public.saved_templates;
drop policy if exists "saved_templates_insert_own" on public.saved_templates;
drop policy if exists "saved_templates_update_own" on public.saved_templates;
drop policy if exists "saved_templates_delete_own" on public.saved_templates;

create policy "saved_templates_select_own"
on public.saved_templates for select
to authenticated
using (auth.uid() = user_id);

create policy "saved_templates_insert_own"
on public.saved_templates for insert
to authenticated
with check (auth.uid() = user_id);

create policy "saved_templates_update_own"
on public.saved_templates for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "saved_templates_delete_own"
on public.saved_templates for delete
to authenticated
using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- user settings

create table if not exists public.user_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  theme text not null default 'grass' check (theme in ('grass', 'clay', 'night', 'hard')),
  default_training_view text not null default 'week' check (default_training_view in ('day', 'week', 'month')),
  notification_preferences jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists user_settings_set_updated_at on public.user_settings;
create trigger user_settings_set_updated_at
before update on public.user_settings
for each row
execute function public.set_updated_at();

alter table public.user_settings enable row level security;

drop policy if exists "user_settings_select_own" on public.user_settings;
drop policy if exists "user_settings_insert_own" on public.user_settings;
drop policy if exists "user_settings_update_own" on public.user_settings;
drop policy if exists "user_settings_delete_own" on public.user_settings;

create policy "user_settings_select_own"
on public.user_settings for select
to authenticated
using (auth.uid() = user_id);

create policy "user_settings_insert_own"
on public.user_settings for insert
to authenticated
with check (auth.uid() = user_id);

create policy "user_settings_update_own"
on public.user_settings for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "user_settings_delete_own"
on public.user_settings for delete
to authenticated
using (auth.uid() = user_id);
