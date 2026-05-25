-- Ensures the family-code table exists for accounts created through the
-- current signup flow. This is safe to run even if 0001_init.sql was skipped.

create extension if not exists pgcrypto;

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

alter table public.profiles add column if not exists family_code text;

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

create index if not exists profiles_family_code_idx
on public.profiles (family_code);
