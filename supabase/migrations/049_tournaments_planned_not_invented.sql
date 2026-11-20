-- 049_tournaments_planned_not_invented.sql
--
-- STATUS: written 2026-11-20 on branch fix/no-invented-goal. Applied and
-- probed on STAGING (gnlcpnsweqbtwpaqhqqg) only. Production gets it on
-- Niran's go, and it MUST be on production BEFORE the fix/no-invented-goal
-- app code merges (HANDOFF §J Step 23, GO-SEQUENCE §3c row 23). Independent
-- of every other migration.
--
-- ===========================================================================
-- Why
-- ===========================================================================
-- `profiles.tournaments_goal integer not null default 12` (001). No screen
-- in Seeded has ever asked anyone for it: sign-up wrote a hardcoded 12
-- (lib/auth.ts, components/auth/signup-flow.tsx), the in-memory emptyPlayer
-- carried 12, and every profile save round-tripped it. The legacy parent
-- dashboard then showed "0/12" with a progress bar, and the cost calculator
-- multiplied by it. Every stored value is the invented default.
--
-- Evidence: production, 2026-11-20 — 8 of 8 profiles hold
-- tournaments_goal = 12 and tournaments_played = 0. Staging, 2026-11-20 —
-- 32 of 32 profiles hold 12/0. There is no value anywhere a person chose.
--
-- ===========================================================================
-- What
-- ===========================================================================
-- tournaments_goal (the app now calls it "Tournaments planned this season",
-- Player.tournamentsPlanned) becomes:
--   * NULLABLE, with NO default. NULL = "Not set". A new row gets NULL.
--   * every existing value set to NULL (see Why: all of them are the 12 the
--     app invented). This is the one data rewrite in this file.
--   * CHECK: null or between 0 and 60. 60 is a sanity ceiling, not a goal
--     anyone is steered towards; the old CHECK was `>= 0` only.
--
-- tournaments_played is LEFT AS IS (column, NOT NULL, default 0, CHECK).
-- The app stops reading and writing it: "played this season" is now derived
-- from tournament_entries rows with status 'played' (047) whose event_date
-- falls in the current season. It is not dropped because dropping is not
-- free here — lib/db/database.types.ts, the account export (select *) and
-- the rollback would all have to move with it, and a column nobody reads
-- does no harm. Its stored values are all 0 (see Evidence), which is not an
-- invented count anyone sees. Dropping it is a separate, later cleanup.
--
-- Triggers checked on staging 2026-11-20 — none reads either column:
--   * profiles_protect_privileged (022/030/035, 041 write-once, 043) —
--     tournaments_goal is not a privileged column, so a client may set it,
--     change it, or clear it.
--   * enforce_free_tier_target_limit (024/040), profiles_set_updated_at,
--     zz_rate_limit_profiles (028) — untouched; an UPDATE here still counts
--     against the caller's profile write limit as any save does.
-- No function or view in `public` references tournaments_goal.
--
-- ===========================================================================
-- Verify (run after applying)
-- ===========================================================================
--   select is_nullable, column_default
--     from information_schema.columns
--    where table_schema = 'public' and table_name = 'profiles'
--      and column_name = 'tournaments_goal';
--   -- is_nullable = YES, column_default = NULL
--
--   select pg_get_constraintdef(oid) from pg_constraint
--    where conname = 'profiles_tournaments_goal_check';
--   -- CHECK (((tournaments_goal IS NULL) OR ((tournaments_goal >= 0) AND (tournaments_goal <= 60))))
--
--   select count(*) filter (where tournaments_goal is null) as unset,
--          count(*) filter (where tournaments_goal is not null) as set
--     from public.profiles;
--   -- set = 0 right after applying.
--
--   As a REAL user (postgres bypasses RLS and is not what the app runs as):
--   begin;
--   select set_config('request.jwt.claims',
--     json_build_object('sub', '<a profile id>', 'role', 'authenticated')::text, true);
--   set local role authenticated;
--   update public.profiles set tournaments_goal = 8  where id = '<that id>';  -- 1 row
--   update public.profiles set tournaments_goal = null where id = '<that id>'; -- 1 row
--   update public.profiles set tournaments_goal = -1 where id = '<that id>';  -- 23514
--   rollback;
--
-- ===========================================================================
-- Rollback
-- ===========================================================================
-- NOTE: this rollback RE-INVENTS THE NUMBER. NOT NULL needs a value in every
-- row, and the only value the old schema ever had was the made-up 12. Any
-- real count a player typed after 049 is kept; only the NULLs become 12.
-- Roll the APP back first (the pre-049 app expects a number and renders
-- "/12" from it).
--
--   begin;
--   update public.profiles set tournaments_goal = 12 where tournaments_goal is null;
--   alter table public.profiles drop constraint if exists profiles_tournaments_goal_check;
--   alter table public.profiles
--     add constraint profiles_tournaments_goal_check check (tournaments_goal >= 0);
--   alter table public.profiles alter column tournaments_goal set default 12;
--   alter table public.profiles alter column tournaments_goal set not null;
--   commit;
--
-- (The UPDATE fires zz_rate_limit_profiles per row; from the SQL editor
-- auth.uid() is NULL and enforce_write_rate_limit() returns early for a NULL
-- user, so a bulk fix is not limited. It also fires profiles_protect_
-- privileged, which does not look at this column.)

alter table public.profiles alter column tournaments_goal drop not null;
alter table public.profiles alter column tournaments_goal drop default;

-- Every stored value is the invented default (see Why). From the SQL editor
-- auth.uid() is NULL, so the rate-limit trigger does not count these rows.
update public.profiles set tournaments_goal = null where tournaments_goal is not null;

alter table public.profiles drop constraint if exists profiles_tournaments_goal_check;
alter table public.profiles
  add constraint profiles_tournaments_goal_check
  check (tournaments_goal is null or (tournaments_goal between 0 and 60));

comment on column public.profiles.tournaments_goal is
  'Tournaments the player plans this season (app label: "Tournaments planned this season"). NULL = not set. Migration 049 cleared the invented default of 12.';
comment on column public.profiles.tournaments_played is
  'Unused since migration 049: the app derives "played this season" from tournament_entries.status = ''played''. Kept, not dropped.';
