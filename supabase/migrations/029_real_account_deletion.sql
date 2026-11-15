-- 029_real_account_deletion.sql  —  P0-8 (deletion half)
--
-- STATUS: APPLIED TO STAGING 2026-11-14. NOT APPLIED TO PRODUCTION.
--
-- WHAT WAS THERE: nothing deleted anything. "Delete account" set
-- `profiles.deletion_requested_at` and stopped. P0-7 already had to rewrite
-- the copy because it promised "Removes everything within 30 days" while no
-- code removed anything and no job was scheduled to. The honest text we
-- shipped instead was "a person completes it by hand" — true, and a bad
-- thing to be true for a product whose users are 13-18.
--
-- WHY THIS IS A DATABASE FUNCTION AND NOT A SERVER ROUTE WITH THE SERVICE
-- ROLE KEY. Deleting the auth.users row needs privileges the user does not
-- have, and the obvious way to get them is supabaseAdmin.auth.admin
-- .deleteUser() from a route. CLAUDE.md forbids exactly that — "Never use
-- the service-role client for a user-initiated write" — and for a good
-- reason: a service-role client ignores RLS, so a bug in the id it is handed
-- deletes somebody else's account. This function takes NO user id. It reads
-- auth.uid() and can delete nothing but the caller. The blast radius is the
-- caller, by construction, not by a correct argument.
--
-- Verified on staging before writing it: `postgres` holds DELETE on
-- auth.users (has_table_privilege('postgres','auth.users','delete') = true),
-- so a SECURITY DEFINER function owned by postgres can do this.
--
-- WHY IT STILL WORKS WITH THE 022 TRIGGER. This has to clear
-- profiles.family_code, which 022 locks against client writes. SECURITY
-- DEFINER makes current_user the owner (postgres), which is the first branch
-- of protect_privileged_profile_columns(). No exemption was added for this.

-- ---------------------------------------------------------------------------
-- What cascades, and the three things that do NOT
-- ---------------------------------------------------------------------------
-- Deleting auth.users cascades to every table keyed on the user:
--   profiles, utr_entries, matches, tournament_entries, coach_outreach,
--   daily_checkins, cost_calculations, recruiting_checklist_items,
--   user_settings, training_plans, workout_sessions, exercises,
--   session_exercises, saved_templates, badges, friendships,
--   family_join_attempts, rate_limit_events, parent_accounts,
--   encouragement_notes, parent_reports, budget_expenses (via
--   created_by -> profiles ON DELETE CASCADE).
-- Confirmed by reading pg_constraint, not assumed: every one of those FKs is
-- ON DELETE CASCADE, and the two that worried MASTER_ROADMAP
-- (season_budgets.updated_by, parent_accounts.approved_by) are ON DELETE SET
-- NULL, so neither blocks a delete.
--
-- The exceptions this function handles by hand:
--
--   1. profiles.family_code -> families.code is ON DELETE **NO ACTION**. It
--      does not block deleting the user (the profile row goes first, as part
--      of the same cascade), but it does block deleting the FAMILY while the
--      profile still points at it. So the code is cleared first.
--
--   2. The `families` row itself is keyed on nothing that cascades. Leaving
--      it behind leaves a family whose every member is gone, still holding a
--      live code.
--
--   3. season_budgets and budget_expenses have NO foreign key on
--      family_code (checked: only created_by/updated_by are keyed). So
--      deleting a family would leave orphaned budget rows with a dangling
--      code — a minor's household spending, kept forever, attached to
--      nothing. They are deleted explicitly.
--
-- ---------------------------------------------------------------------------
-- "Must not orphan the player or break the family"
-- ---------------------------------------------------------------------------
-- The family is deleted only when the departing account was its LAST member.
-- Membership is counted two ways, because the two signup orders store it
-- differently and counting only one of them is the bug waiting to happen:
--
--   * profiles.family_code      — the member who created the family
--   * parent_accounts.user_id   — everyone who joined with the code, which
--                                 (since 023) includes a joining PLAYER as
--                                 well as a joining parent
--
-- A parent-first family stores the parent in profiles.family_code and the
-- child in parent_accounts. Counting only profiles would have deleted that
-- family — and the child's link to it — the moment the parent left.
--
-- If anyone else remains, the family and their link both survive untouched.
-- A family can therefore end up with no player in it (its player left while
-- a parent stayed). That is a real state and the UI handles it: my_family_code()
-- still resolves for the parent, family_members() lists them, and nothing
-- crashes. It is not silently repaired, because inventing a new owner for
-- someone else's family is not ours to do.

create or replace function public.delete_my_account()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_code text;
  v_remaining int;
  v_family_deleted boolean := false;
begin
  if v_user is null then
    raise exception 'Sign in first.' using errcode = '28000';
  end if;

  select family_code into v_code from public.profiles where id = v_user;

  -- Exception 1: free the NO ACTION foreign key before the family can go.
  if v_code is not null then
    update public.profiles set family_code = null where id = v_user;
  end if;

  if v_code is not null then
    select count(*) into v_remaining
    from (
      select id as member from public.profiles
        where family_code = v_code and id <> v_user
      union
      select user_id as member from public.parent_accounts
        where family_code = v_code and user_id <> v_user
    ) remaining_members;

    if v_remaining = 0 then
      -- Exception 3: no FK would do this for us.
      delete from public.budget_expenses where family_code = v_code;
      delete from public.season_budgets  where family_code = v_code;
      -- Exception 2: cascades family_codes, parent_accounts,
      -- encouragement_notes and parent_reports; nulls the family_code on
      -- matches / daily_checkins / cost_calculations.
      delete from public.families where code = v_code;
      v_family_deleted := true;
    end if;
  end if;

  -- Everything else goes with this one statement.
  delete from auth.users where id = v_user;

  return jsonb_build_object(
    'status', 'deleted',
    'family_deleted', v_family_deleted
  );
end;
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

-- ---------------------------------------------------------------------------
-- deletion_requested_at
-- ---------------------------------------------------------------------------
-- The column stays. It is not the mechanism any more (there is no grace
-- period: "Delete account" deletes), but it is the record of requests made
-- while the soft-delete flow was live, and those people are owed a real
-- deletion by hand. Dropping the column would erase the only list of who
-- asked. Nothing in the app writes it after this migration.
comment on column public.profiles.deletion_requested_at is
  'Historical. Soft-delete requests made before 029 added real deletion. Not written by the app any more; kept so pending requests are not lost. Real deletion is delete_my_account().';

-- ---------------------------------------------------------------------------
-- Verification (staging, as a throwaway test user)
-- ---------------------------------------------------------------------------
--   select public.delete_my_account();
--   -> {"status":"deleted","family_deleted":true|false}
--   -- then, as postgres:
--   select count(*) from auth.users where id = '<that id>';            -> 0
--   select count(*) from public.profiles where id = '<that id>';       -> 0
--   select count(*) from public.utr_entries where user_id = '<that>';  -> 0
--   ... and the same for every table above.
--
-- ROLLBACK: docs/HANDOFF.md §J step 7. Note that rollback restores the
-- FUNCTION, not the data: a completed deletion is not reversible, which is
-- the point and is what the UI says before it runs.
