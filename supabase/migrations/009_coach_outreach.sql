-- Coach outreach contact/reply tracking used to live only in localStorage,
-- unlike every other piece of player data — it silently vanished across
-- devices or a cleared cache. This gives it a real per-account home.

create table public.coach_outreach (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  family_code text,
  school_slug text not null,
  status text not null check (status in ('contacted', 'replied')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, school_slug)
);

alter table public.coach_outreach enable row level security;

create policy coach_outreach_read on public.coach_outreach
  for select
  using (user_id = auth.uid() or is_family_member(family_code));

create policy coach_outreach_write_own on public.coach_outreach
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
