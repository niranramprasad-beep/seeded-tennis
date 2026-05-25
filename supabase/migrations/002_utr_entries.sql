-- UTR history for player progress charts.

create extension if not exists pgcrypto;

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

create table if not exists public.utr_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  utr numeric(4,2) not null check (utr between 1 and 16),
  recorded_at date not null default current_date,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists utr_entries_set_updated_at on public.utr_entries;
create trigger utr_entries_set_updated_at
before update on public.utr_entries
for each row
execute function public.set_updated_at();

alter table public.utr_entries enable row level security;

create index if not exists utr_entries_user_recorded_idx
on public.utr_entries (user_id, recorded_at desc);

drop policy if exists "utr_entries_select_own" on public.utr_entries;
drop policy if exists "utr_entries_insert_own" on public.utr_entries;
drop policy if exists "utr_entries_update_own" on public.utr_entries;
drop policy if exists "utr_entries_delete_own" on public.utr_entries;

create policy "utr_entries_select_own"
on public.utr_entries for select
to authenticated
using (auth.uid() = user_id);

create policy "utr_entries_insert_own"
on public.utr_entries for insert
to authenticated
with check (auth.uid() = user_id);

create policy "utr_entries_update_own"
on public.utr_entries for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "utr_entries_delete_own"
on public.utr_entries for delete
to authenticated
using (auth.uid() = user_id);
