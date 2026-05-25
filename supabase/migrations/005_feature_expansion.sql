-- Seeded feature expansion: check-ins, matches, badges, friends, parent tools.
-- Safe to run after migrations 001-004.

create extension if not exists pgcrypto;

create table if not exists public.family_codes (
  code text primary key references public.families (code) on delete cascade,
  player_id uuid references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.parent_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  family_code text not null references public.families (code) on delete cascade,
  player_id uuid references auth.users (id) on delete cascade,
  relationship text,
  created_at timestamptz not null default now(),
  unique (user_id, family_code)
);

create table if not exists public.daily_checkins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  family_code text references public.families (code) on delete set null,
  checkin_date date not null,
  mood integer not null check (mood between 1 and 5),
  focus_areas text[] not null default '{}',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, checkin_date)
);

create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  family_code text references public.families (code) on delete set null,
  match_date date not null,
  opponent text,
  opponent_utr numeric(4,2),
  tournament_name text,
  surface text not null default 'hard' check (surface in ('hard', 'clay', 'grass', 'indoor')),
  prep_plan jsonb not null default '{}',
  notification_requested boolean not null default false,
  result text check (result is null or result in ('win', 'loss')),
  score text,
  worked text,
  needs_work text,
  notes text,
  video_url text,
  ai_analysis jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.badges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  badge_key text not null,
  badge_type text not null,
  title text not null,
  description text,
  earned_at timestamptz not null default now(),
  unique (user_id, badge_key)
);

create table if not exists public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references auth.users (id) on delete cascade,
  addressee_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (requester_id, addressee_id),
  check (requester_id <> addressee_id)
);

create table if not exists public.cost_calculations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  family_code text references public.families (code) on delete set null,
  name text not null default 'College tennis pursuit',
  inputs jsonb not null default '{}',
  results jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.parent_reports (
  id uuid primary key default gen_random_uuid(),
  family_code text not null references public.families (code) on delete cascade,
  player_id uuid references auth.users (id) on delete cascade,
  month date not null,
  title text not null,
  summary jsonb not null default '{}',
  storage_path text,
  public_url text,
  emailed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (family_code, month)
);

create table if not exists public.encouragement_notes (
  id uuid primary key default gen_random_uuid(),
  family_code text not null references public.families (code) on delete cascade,
  parent_id uuid not null references auth.users (id) on delete cascade,
  player_id uuid references auth.users (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

alter table public.profiles add column if not exists username text;
alter table public.profiles add column if not exists privacy_level text not null default 'friends' check (privacy_level in ('public', 'friends', 'private'));

create unique index if not exists profiles_username_unique_idx
on public.profiles (lower(username))
where username is not null;

create index if not exists daily_checkins_user_date_idx on public.daily_checkins (user_id, checkin_date desc);
create index if not exists matches_user_date_idx on public.matches (user_id, match_date desc);
create index if not exists badges_user_idx on public.badges (user_id, earned_at desc);
create index if not exists friendships_requester_idx on public.friendships (requester_id, status);
create index if not exists friendships_addressee_idx on public.friendships (addressee_id, status);
create index if not exists parent_accounts_family_idx on public.parent_accounts (family_code);
create index if not exists parent_reports_family_idx on public.parent_reports (family_code, month desc);

drop trigger if exists daily_checkins_set_updated_at on public.daily_checkins;
create trigger daily_checkins_set_updated_at before update on public.daily_checkins for each row execute function public.set_updated_at();
drop trigger if exists matches_set_updated_at on public.matches;
create trigger matches_set_updated_at before update on public.matches for each row execute function public.set_updated_at();
drop trigger if exists friendships_set_updated_at on public.friendships;
create trigger friendships_set_updated_at before update on public.friendships for each row execute function public.set_updated_at();
drop trigger if exists cost_calculations_set_updated_at on public.cost_calculations;
create trigger cost_calculations_set_updated_at before update on public.cost_calculations for each row execute function public.set_updated_at();

alter table public.family_codes enable row level security;
alter table public.parent_accounts enable row level security;
alter table public.daily_checkins enable row level security;
alter table public.matches enable row level security;
alter table public.badges enable row level security;
alter table public.friendships enable row level security;
alter table public.cost_calculations enable row level security;
alter table public.parent_reports enable row level security;
alter table public.encouragement_notes enable row level security;

create or replace function public.is_family_member(target_family_code text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.family_code = target_family_code
  )
  or exists (
    select 1 from public.parent_accounts pa
    where pa.user_id = auth.uid() and pa.family_code = target_family_code
  )
$$;

create or replace function public.are_friends(a uuid, b uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.friendships f
    where f.status = 'accepted'
      and ((f.requester_id = a and f.addressee_id = b) or (f.requester_id = b and f.addressee_id = a))
  )
$$;

drop policy if exists "profiles_discovery_read" on public.profiles;
create policy "profiles_discovery_read" on public.profiles
  for select
  using (
    privacy_level = 'public'
    or id = auth.uid()
    or public.are_friends(auth.uid(), id)
    or family_code = public.current_family_code()
  );

-- Policies
drop policy if exists "family_codes_read_family" on public.family_codes;
create policy "family_codes_read_family" on public.family_codes for select using (public.is_family_member(code) or player_id = auth.uid());
drop policy if exists "family_codes_write_owner" on public.family_codes;
create policy "family_codes_write_owner" on public.family_codes for insert with check (player_id = auth.uid());

drop policy if exists "parent_accounts_read_family" on public.parent_accounts;
create policy "parent_accounts_read_family" on public.parent_accounts for select using (user_id = auth.uid() or public.is_family_member(family_code));
drop policy if exists "parent_accounts_insert_self" on public.parent_accounts;
create policy "parent_accounts_insert_self" on public.parent_accounts for insert with check (user_id = auth.uid());

drop policy if exists "daily_checkins_read" on public.daily_checkins;
create policy "daily_checkins_read" on public.daily_checkins for select using (user_id = auth.uid() or public.is_family_member(family_code));
drop policy if exists "daily_checkins_write_own" on public.daily_checkins;
create policy "daily_checkins_write_own" on public.daily_checkins for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "matches_read" on public.matches;
create policy "matches_read" on public.matches for select using (user_id = auth.uid() or public.is_family_member(family_code));
drop policy if exists "matches_write_own" on public.matches;
create policy "matches_write_own" on public.matches for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "badges_read" on public.badges;
create policy "badges_read" on public.badges for select using (
  user_id = auth.uid()
  or public.are_friends(auth.uid(), user_id)
  or exists (select 1 from public.profiles p where p.id = user_id and p.privacy_level = 'public')
);
drop policy if exists "badges_write_own" on public.badges;
create policy "badges_write_own" on public.badges for insert with check (user_id = auth.uid());

drop policy if exists "friendships_read_involved" on public.friendships;
create policy "friendships_read_involved" on public.friendships for select using (requester_id = auth.uid() or addressee_id = auth.uid());
drop policy if exists "friendships_insert_self" on public.friendships;
create policy "friendships_insert_self" on public.friendships for insert with check (requester_id = auth.uid());
drop policy if exists "friendships_update_involved" on public.friendships;
create policy "friendships_update_involved" on public.friendships for update using (requester_id = auth.uid() or addressee_id = auth.uid());

drop policy if exists "cost_calculations_read" on public.cost_calculations;
create policy "cost_calculations_read" on public.cost_calculations for select using (user_id = auth.uid() or public.is_family_member(family_code));
drop policy if exists "cost_calculations_write_own" on public.cost_calculations;
create policy "cost_calculations_write_own" on public.cost_calculations for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "parent_reports_read_family" on public.parent_reports;
create policy "parent_reports_read_family" on public.parent_reports for select using (public.is_family_member(family_code));
drop policy if exists "parent_reports_service_insert" on public.parent_reports;
create policy "parent_reports_service_insert" on public.parent_reports for insert with check (public.is_family_member(family_code));

drop policy if exists "encouragement_notes_read_family" on public.encouragement_notes;
create policy "encouragement_notes_read_family" on public.encouragement_notes for select using (public.is_family_member(family_code));
drop policy if exists "encouragement_notes_insert_parent" on public.encouragement_notes;
create policy "encouragement_notes_insert_parent" on public.encouragement_notes for insert with check (parent_id = auth.uid() and public.is_family_member(family_code));

-- Storage buckets are created manually in the dashboard:
-- parent-reports (private), match-videos (private)
drop policy if exists "match_videos_owner_upload" on storage.objects;
create policy "match_videos_owner_upload" on storage.objects
  for insert
  with check (bucket_id = 'match-videos' and auth.uid()::text = (storage.foldername(name))[1]);

drop policy if exists "match_videos_owner_read" on storage.objects;
create policy "match_videos_owner_read" on storage.objects
  for select
  using (bucket_id = 'match-videos' and auth.uid()::text = (storage.foldername(name))[1]);
