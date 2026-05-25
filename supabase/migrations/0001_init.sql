-- Seeded — initial schema
-- Run this in the Supabase SQL editor (or via the CLI) after creating a project.
-- The app works without it (local fallback); these tables back real accounts.

-- Families: a shareable code links a player with their parents/siblings.
create table if not exists public.families (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  name text,
  created_at timestamptz not null default now()
);

-- Profiles: one row per auth user, linked to a family by code.
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null,
  email text,
  country text,
  gender text check (gender in ('male', 'female')),
  grade int check (grade between 8 and 12),
  role text check (role in ('player', 'parent')) default 'player',
  family_code text references public.families (code),
  -- tennis profile (filled during onboarding)
  current_utr numeric,
  graduation_year int,
  target_school_slugs text[] default '{}',
  weaknesses text[] default '{}',
  created_at timestamptz not null default now()
);

alter table public.families enable row level security;
alter table public.profiles enable row level security;

-- A user can read/write their own profile.
create policy "own profile read" on public.profiles
  for select using (auth.uid() = id);
create policy "own profile upsert" on public.profiles
  for insert with check (auth.uid() = id);
create policy "own profile update" on public.profiles
  for update using (auth.uid() = id);

-- Family members (sharing a code) can read each other's profiles.
create policy "family members read" on public.profiles
  for select using (
    family_code in (
      select p.family_code from public.profiles p where p.id = auth.uid()
    )
  );

-- Authenticated users can look up / create families (codes are unguessable).
create policy "families readable" on public.families
  for select using (true);
create policy "families insertable" on public.families
  for insert with check (auth.role() = 'authenticated');
