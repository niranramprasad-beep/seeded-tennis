-- Real backing for /plan's new "Recruiting timeline" checklist (Redesign
-- Phase 7). The checklist mixes computed default items (NCAA Eligibility
-- Center registration, D1/D3 contact-window milestones, target list, UTR
-- profile link, coach emails, highlight video, camps/showcases — see
-- lib/recruiting-checklist.ts) with a player's own custom items, and lets
-- a player check off, hide, or add to any of it. None of that had a real
-- home before this — one table, scoped to the user, sparse by design: a
-- row only needs to exist once a DEFAULT item's state diverges from
-- (completed=false, hidden=false), or for any custom item (which only
-- exists because a row was explicitly inserted for it).
--
-- `item_key` is a stable id: the fixed string from
-- lib/recruiting-checklist.ts's default-item list (e.g. "ncaa-eligibility")
-- for defaults, or a client-generated uuid for a custom item. `label` is
-- only ever set for custom items — a default item's label always comes
-- from code, never the database, so copy changes never require touching
-- stored rows.
--
-- Note 012 is intentionally skipped here (reserved for an unrelated
-- roster-data project) — this is migration 016, continuing on from 015.
--
-- NOT applied automatically — this file is tracked in git for review and
-- must be run against the real Supabase project by hand, same "011/013/
-- 014/015 discipline" as every other migration in this project.

create table public.recruiting_checklist_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  item_key text not null,
  is_custom boolean not null default false,
  label text,
  completed boolean not null default false,
  hidden boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, item_key),
  constraint recruiting_checklist_items_custom_needs_label
    check (not is_custom or label is not null)
);

alter table public.recruiting_checklist_items enable row level security;

create index if not exists recruiting_checklist_items_user_idx
on public.recruiting_checklist_items (user_id);

create policy recruiting_checklist_items_select_own
on public.recruiting_checklist_items for select
to authenticated
using (user_id = auth.uid());

create policy recruiting_checklist_items_write_own
on public.recruiting_checklist_items for all
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop trigger if exists recruiting_checklist_items_set_updated_at on public.recruiting_checklist_items;
create trigger recruiting_checklist_items_set_updated_at
before update on public.recruiting_checklist_items
for each row
execute function public.set_updated_at();
