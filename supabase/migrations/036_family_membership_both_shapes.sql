-- 036_family_membership_both_shapes.sql  —  the joined-player read gap
--
-- STATUS: applied to staging 2026-11-15. NOT applied to production.
-- Ships with 023 + 026 + 027 + 030 + 031 + 033 + 035 and the code.
--
-- Niran's decision, 2026-11-15, verbatim:
--   "when a player joins a family with the code and is approved, that is the
--    player's opt-in. Approved parents in that family may read that player's
--    data, exactly like parent-first. Nobody outside the family, no pending
--    members."
--
-- ---------------------------------------------------------------------------
-- THE ROOT CAUSE, which is one thing wearing two disguises
-- ---------------------------------------------------------------------------
-- "Which family does this user belong to?" has TWO storage shapes:
--
--   (a) the creator  -> public.profiles.family_code
--   (b) every joiner -> public.parent_accounts(user_id, family_code,
--                       status='approved'), and their profiles.family_code is
--                       deliberately left NULL, because WRITING that column
--                       is exactly the family-takeover hole 022/032 closed.
--
-- `my_family_code()` (026) already answers the question correctly across both
-- shapes. Almost nothing else did. Two separate failures came out of that:
--
--   1. READS. `profiles.family_members_read` was
--        (family_code IS NOT NULL) AND is_family_member(family_code)
--      and `utr_entries_select_family` keyed off `profiles owner.family_code`
--      the same way. A joiner's family_code is NULL, so neither can ever
--      match. Reproduced on staging before this migration: the creator-parent
--      of FAKEFAMILY01 saw 1 profile (their own) and 0 of the joined player's
--      3 utr_entries rows, while my_family_code() returned 'FAKEFAMILY01'.
--
--   2. WRITES. `matches`, `coach_outreach`, `tournament_entries`,
--      `daily_checkins`, `cost_calculations`, `encouragement_notes`,
--      `season_budgets`, `budget_expenses` and `parent_reports` each carry
--      their OWN family_code column, stamped by the app from
--      profiles.family_code. For a joiner that is NULL, so:
--        * their matches/tournaments/outreach rows are stamped NULL and no
--          family member can read them, and
--        * a joined PARENT cannot write at all — the WITH CHECK on
--          encouragement_notes / season_budgets / budget_expenses is
--          is_family_member(family_code) / is_parent_member(family_code), and
--          both are false for NULL. So "parents can write exactly two things"
--          was zero things for a parent who joined by code.
--
--   docs/TODO.md recorded (2) as "matches, coach_outreach and
--   tournament_entries carry their own family_code column and do not have
--   this problem." That was wrong. It is true in the player-first flow (the
--   player is the creator, so the stamp is correct) and false in the
--   parent-first flow, which is the ordinary one.
--
-- ---------------------------------------------------------------------------
-- THE FIX: make membership follow the PERSON, not a denormalised copy
-- ---------------------------------------------------------------------------
-- 1. shares_approved_family_with(uuid) — one predicate, both shapes.
-- 2. Every family SELECT policy on a user-owned table keys off the ROW
--    OWNER's membership instead of the row's stamped family_code.
-- 3. A BEFORE INSERT/UPDATE trigger stamps family_code from
--    my_family_code(), so the column is right for both shapes and can no
--    longer be set to someone else's family from the client.
--
-- WHAT THIS DELIBERATELY DOES NOT DO
--   * It does not set a joiner's profiles.family_code. That write is the
--     takeover capability (022/032) and, worse, `remove_family_member()`
--     only deletes the parent_accounts row — so a removed member would KEEP
--     a family_code and keep their access. Revocation has to stay in one
--     place, and that place is parent_accounts.
--   * It does not backfill the NULL family_code on rows written before this
--     migration. Backfilling would retroactively widen who can read data
--     that was private when it was written. Those rows stay readable by
--     their owner only; everything written from now on is correct.
--   * It does not touch is_parent_member(), which still grants season-budget
--     writes to any approved joiner regardless of `role` (CLAUDE.md records
--     this). That is a WRITE-authorisation change nobody asked for and it is
--     not going into the launch migration. docs/TODO.md carries the fix.

-- ---------------------------------------------------------------------------
-- 1. One predicate for "we are in the same approved family"
-- ---------------------------------------------------------------------------
-- SECURITY DEFINER so it can read profiles/parent_accounts without tripping
-- the profiles-policy recursion 004 had to fix, exactly as is_family_member()
-- has done since 023 §8.
--
-- EXECUTE must stay granted to `authenticated`: Postgres checks EXECUTE on a
-- function used inside an RLS policy against the role running the query, so
-- revoking it fails the policy CLOSED. Proven on staging in 027 — do not
-- re-litigate it from the advisor's wording.
--
-- The RPC surface this adds is a self-answer: "do I share a family with user
-- X?" It returns true only for members of the caller's own family, who the
-- caller can already list through family_members(). It tells them nothing
-- about anybody else, and nothing at all to a pending member (whose own
-- membership set is empty, so every answer is false).

create or replace function public.shares_approved_family_with(p_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  with mine as (
    select p.family_code as code
      from public.profiles p
     where p.id = auth.uid() and p.family_code is not null
    union
    select pa.family_code
      from public.parent_accounts pa
     where pa.user_id = auth.uid() and pa.status = 'approved'
  ),
  theirs as (
    select p.family_code as code
      from public.profiles p
     where p.id = p_user_id and p.family_code is not null
    union
    select pa.family_code
      from public.parent_accounts pa
     where pa.user_id = p_user_id and pa.status = 'approved'
  )
  select exists (select 1 from mine join theirs using (code));
$$;

revoke all on function public.shares_approved_family_with(uuid) from public, anon;
grant execute on function public.shares_approved_family_with(uuid) to authenticated;

-- Both halves of the predicate are point lookups; these make them so.
create index if not exists profiles_family_code_idx
  on public.profiles (family_code) where family_code is not null;
create index if not exists parent_accounts_user_status_idx
  on public.parent_accounts (user_id, status);

-- ---------------------------------------------------------------------------
-- 2. Family reads follow the row's OWNER
-- ---------------------------------------------------------------------------
-- Each of these REPLACES the old family branch rather than being ORed with
-- it, so there is one rule per table and not a pair that reads as a
-- contradiction to the next person.
--
-- Net effect per table:
--   + a row whose owner is an approved member of my family is now readable
--     even when its family_code is NULL   (the bug)
--   - a row stamped with family C whose owner has since LEFT family C is no
--     longer readable by C's members      (correct: membership follows the
--                                          person, and this is the direction
--                                          that denies rather than grants)
--
-- The RESTRICTIVE account_active_required policy from 030 still ANDs with
-- every one of these, so an unconsented under-13 account reads nothing here
-- and nothing below needs to repeat that check.

drop policy if exists "family_members_read" on public.profiles;
create policy "family_members_read" on public.profiles
  for select to authenticated
  using (public.shares_approved_family_with(profiles.id));

drop policy if exists "utr_entries_select_family" on public.utr_entries;
create policy "utr_entries_select_family" on public.utr_entries
  for select to authenticated
  using (public.shares_approved_family_with(utr_entries.user_id));

drop policy if exists "matches_read" on public.matches;
create policy "matches_read" on public.matches
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or public.shares_approved_family_with(matches.user_id)
  );

drop policy if exists "tournament_entries_read" on public.tournament_entries;
create policy "tournament_entries_read" on public.tournament_entries
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or public.shares_approved_family_with(tournament_entries.user_id)
  );

drop policy if exists "coach_outreach_read" on public.coach_outreach;
create policy "coach_outreach_read" on public.coach_outreach
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or public.shares_approved_family_with(coach_outreach.user_id)
  );

drop policy if exists "daily_checkins_read" on public.daily_checkins;
create policy "daily_checkins_read" on public.daily_checkins
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or public.shares_approved_family_with(daily_checkins.user_id)
  );

drop policy if exists "cost_calculations_read" on public.cost_calculations;
create policy "cost_calculations_read" on public.cost_calculations
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or public.shares_approved_family_with(cost_calculations.user_id)
  );

-- ---------------------------------------------------------------------------
-- 3. family_code is stamped by the database, not supplied by the client
-- ---------------------------------------------------------------------------
-- WHY A TRIGGER AND NOT AN APP FIX
-- The app does need its own change (lib/db/family.ts and lib/api-auth.ts read
-- profiles.family_code to SCOPE their queries, and a joined parent got NULL
-- and bailed before RLS was ever consulted). But the stamp itself is a
-- security property — it decides which family a row belongs to — so it
-- belongs in the database, where no new call site can forget it.
--
-- It also closes a hole that was already open: every INSERT policy on these
-- tables checks only `user_id = auth.uid()`, never the family_code, so a
-- client could stamp its own row with ANY family's code and publish its own
-- data into a stranger's family page. After this, the client's value is
-- ignored on INSERT and frozen on UPDATE.
--
-- ORDER OF OPERATIONS THIS RELIES ON, and the 035 lesson applied properly:
--   * A BEFORE ROW trigger runs before RLS WITH CHECK is evaluated, which is
--     what makes the joined-parent write succeed: the WITH CHECK then sees a
--     real family_code instead of NULL. Verified on staging, not assumed.
--   * INSERT ... ON CONFLICT DO UPDATE fires BEFORE INSERT for every row,
--     even when the row already exists (this is what broke 032/033 and is
--     fixed in 035). season_budgets is upserted on family_code, so the
--     stamped value is the one the conflict is detected against — which is
--     precisely what makes a joined parent's upsert find the existing row
--     instead of trying to insert a second one.
--
-- NOT NULL note: season_budgets.family_code and encouragement_notes.
-- family_code are NOT NULL. A caller whose my_family_code() is NULL (no
-- family, or a PENDING member) now gets 23502 instead of 42501. Both are
-- refusals and neither is reachable from the UI; the row is not written
-- either way.

create or replace function public.stamp_family_code()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  -- Service role, report generation and every SECURITY DEFINER function
  -- (which runs as the owner) manage family_code themselves. Same exemption
  -- list as 022/030/035's profile trigger.
  if current_user in ('service_role', 'postgres', 'supabase_admin') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- Authoritative, not a default: whatever the client sent is discarded.
    -- NULL is a legitimate answer — a solo player with no family — and such
    -- a row stays readable only through `user_id = auth.uid()`.
    new.family_code := public.my_family_code();
  else
    -- A row cannot be re-parented into another family after the fact.
    new.family_code := old.family_code;
  end if;

  return new;
end;
$$;

revoke all on function public.stamp_family_code() from public, anon, authenticated;

do $$
declare
  t text;
  stamped constant text[] := array[
    'matches', 'coach_outreach', 'tournament_entries', 'daily_checkins',
    'cost_calculations', 'encouragement_notes', 'season_budgets',
    'budget_expenses', 'parent_reports'
  ];
begin
  foreach t in array stamped loop
    execute format('drop trigger if exists stamp_family_code on public.%I', t);
    execute format(
      'create trigger stamp_family_code before insert or update on public.%I '
      'for each row execute function public.stamp_family_code()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Verification (run as a test user on staging, NOT as postgres)
-- ---------------------------------------------------------------------------
-- `postgres` BYPASSES RLS. set_config('request.jwt.claims', ...) sets
-- auth.uid() but leaves you a superuser, so a row count comes back complete
-- and looks like a pass. `set local role authenticated` as well, always.
--
--   -- creator-parent of FAKEFAMILY01, joined player is ...0d0003:
--   select count(*) from public.profiles;                            -> 2
--   select count(*) from public.utr_entries where user_id='...0003'; -> 3
--   -- a stranger:                                                   -> 1, 0
--   -- a PENDING joiner:                                             -> 1, 0
--   -- a member of a different family:                               -> own only
--   -- after remove_family_member(): immediately                     -> 1, 0
--   -- joined parent writes an encouragement note                    -> OK
--   -- joined player's new match row carries the family code         -> OK
--   -- client-supplied foreign family_code on INSERT is discarded    -> OK
--
-- ROLLBACK: docs/HANDOFF.md §J step 16.
