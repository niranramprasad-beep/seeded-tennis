-- 055_program_roster_private_ratings.sql
--
-- STATUS: written 2026-11-27 (Niran: "screen first, lock the DB next").
-- Applied to STAGING only. Production waits for Niran's go, a fresh backup
-- and docs/HANDOFF.md §J Step 30. It must reach production BEFORE the code
-- that calls program_roster_page() is merged (lib/db/roster.ts).
--
-- ===========================================================================
-- Why, and the decision it implements
-- ===========================================================================
-- Niran ruled on 2026-11-27 (DECISIONS.md, same date) that a college roster
-- player's exact UTR never reaches a screen, page source or API response a
-- visitor can read: only the whole number ("12.xx"). PR #64 cut the rating
-- on the server, but 054 grants anon/authenticated SELECT on EVERY column of
-- program_roster, so anyone with the publishable key could still read the
-- exact `utr` (and the old `hometown`) through the REST API:
--   GET /rest/v1/program_roster?select=player_name,utr,hometown
--
-- This migration:
--   1. revokes the table-wide SELECT from anon and authenticated, and grants
--      SELECT back column by column on every column EXCEPT `utr` and
--      `hometown`. A request naming either column (or `select=*`) now fails
--      with "permission denied".
--   2. nulls `hometown` on every row. The importer stopped writing it on
--      2026-11-27 (PR #64), but rows imported before that hold real
--      hometowns. No page reads the column. The column itself stays, so 054's
--      shape and the importer's SQL are unchanged.
--   3. adds program_roster_page(p_slug): a SECURITY DEFINER read that returns
--      one program's roster with the rating as floor(utr)::int (`utr_whole`),
--      never the exact number. The school page reads through it.
--
-- The exact `utr` stays in the table: it is the source of record (the sheet
-- read), and the owner's SQL-editor / service-role import still writes it.
-- Team ranges do NOT read it: they are computed by the importer from the
-- sheet's CSV and stored in team_ranges (048). Exact team numbers in the page
-- source are a separate open item (TODO §2, "Exact team numbers are still in
-- the page source"), not touched here.
--
-- RLS: program_roster_public_read (054, `using (true)`) is unchanged; column
-- privileges are checked before RLS, so it now admits only the granted
-- columns. The definer function runs as its owner (postgres) and returns only
-- the columns listed below.
--
-- ===========================================================================
-- Who can write
-- ===========================================================================
-- Unchanged from 054: nobody but the service role / SQL editor.
--
-- ===========================================================================
-- Verify (staging 2026-11-27: see ~/seeded-evidence/roster-utr-lockdown/)
-- ===========================================================================
--   -- as postgres: column grants (expect 7 rows per role, no utr/hometown)
--   select grantee, column_name from information_schema.column_privileges
--    where table_schema = 'public' and table_name = 'program_roster'
--      and grantee in ('anon', 'authenticated') and privilege_type = 'SELECT'
--    order by 1, 2;
--   -- expect 0
--   select count(*) from public.program_roster where hometown is not null;
--   -- as a visitor (each in its own transaction; expect permission denied)
--   begin; set local role anon; select utr from public.program_roster limit 1; rollback;
--   begin; set local role anon; select hometown from public.program_roster limit 1; rollback;
--   -- as a visitor: whole numbers only
--   begin; set local role anon;
--   select * from public.program_roster_page('<a slug with a roster>'); rollback;
--
-- ===========================================================================
-- Rollback (pasteable; restores 054's grants. The hometowns nulled in step 2
-- are NOT restored by this: re-import from the sheet if ever needed, which
-- the importer no longer does by design.)
-- ===========================================================================
--   begin;
--   drop function if exists public.program_roster_page(text);
--   revoke select on table public.program_roster from anon, authenticated;
--   grant select on table public.program_roster to anon, authenticated;
--   commit;
-- Roll back the CODE first (revert the PR that reads program_roster_page),
-- or the school page's roster goes empty — it never throws.
--
-- No begin/commit here, like 054: the runner wraps the file in one
-- transaction (apply_migration on staging; HANDOFF §J Step 30 on production).

-- 1. Column-level read: everything but the exact rating and the hometown.
revoke select on table public.program_roster from anon, authenticated;
grant select (program_id, player_name, class_label, grad_year, utr_reliable, utr_profile_url, read_date)
  on table public.program_roster to anon, authenticated;

-- 2. Hometowns were real people's hometowns; nothing reads them.
update public.program_roster set hometown = null where hometown is not null;

-- 3. The roster page's read: whole numbers only.
create or replace function public.program_roster_page(p_slug text)
returns table (
  player_name text,
  class_label text,
  grad_year int,
  utr_whole int,
  utr_reliable boolean,
  utr_profile_url text,
  read_date date
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    r.player_name,
    r.class_label,
    r.grad_year,
    -- 054's CHECK already ties a rating to its profile link; repeated here so
    -- this function can never return a rating without its source.
    case when r.utr_profile_url is not null then floor(r.utr)::int end as utr_whole,
    (r.utr_reliable and r.utr is not null and r.utr_profile_url is not null) as utr_reliable,
    r.utr_profile_url,
    r.read_date
  from public.program_roster r
  join public.programs p on p.id = r.program_id
  where p.slug = p_slug
  -- Reliable, then unreliable, then unrated; by whole number; by name. Never
  -- by the exact rating (that order would leak it). lib/db/roster.ts sorts
  -- again with the same rule.
  order by
    case when r.utr is null or r.utr_profile_url is null then 2 when r.utr_reliable then 0 else 1 end,
    floor(r.utr) desc nulls last,
    r.player_name;
$$;

comment on function public.program_roster_page(text) is
  'One program''s official roster for its public school page, with each rating as its whole number (floor) only. Migration 055; Niran 2026-11-27.';

-- CREATE FUNCTION grants EXECUTE to PUBLIC by default: take it back, then
-- give it to exactly the roles the public school page uses.
revoke all on function public.program_roster_page(text) from public, anon, authenticated;
grant execute on function public.program_roster_page(text) to anon, authenticated, service_role;
