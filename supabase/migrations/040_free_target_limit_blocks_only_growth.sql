-- 040_free_target_limit_blocks_only_growth.sql
--
-- STATUS: written 2026-11-16 during the production rollout, after 024 was
-- already applied to production. Apply AFTER 035 (it calls
-- profile_row_exists(), which 035 creates) — in the GO sequence it runs last,
-- after 039 and before the code merge.
--
-- ===========================================================================
-- What 024 got wrong, found on production's real data
-- ===========================================================================
-- 024's trigger caps Free accounts at 3 target schools. HANDOFF §J step 4
-- says "the trigger only blocks *growth*": a Free account already over the
-- limit keeps its schools and can prune. The trigger did not implement that:
--
--   1. On UPDATE it let a save through only if the list SHRANK
--      (`new_count < old_count`). A save that leaves the list the same size —
--      which is every profile save, because writeCurrentPlayerProfile()
--      (lib/auth.ts) sends target_school_slugs every time — was refused.
--   2. The app saves with `.upsert()`. An upsert's INSERT half fires BEFORE
--      INSERT triggers even when the row exists (the same trap 035 fixed for
--      the privileged-column guard), and that branch has no OLD to compare
--      with. So even removing ONE school (5 -> 4) was refused. The only save
--      that could succeed was one that dropped straight to 3.
--
-- Production had two real Free players with 5 targets each when 024 was
-- applied (measured 2026-11-16, read-only and in rolled-back transactions).
-- Under the v1 code both would have been unable to save anything to their
-- profile — a renamed player, a new UTR, nothing — and unable to get out of
-- it one school at a time. No staging seed had a Free account over the
-- limit, which is why three rehearsals did not see it.
--
-- ===========================================================================
-- The rule now: a Free account may never GROW its list past 3
-- ===========================================================================
--   * new list <= 3                                 -> allowed (unchanged)
--   * paid tier                                     -> allowed (unchanged)
--   * UPDATE where new count <= old count           -> allowed (was: <)
--   * INSERT half of an upsert on an existing row   -> deferred to the
--       UPDATE half, which compares against OLD. ON CONFLICT DO UPDATE fires
--       BEFORE UPDATE triggers, and this one is `update of
--       target_school_slugs`, which the upsert's SET list always includes.
--   * a real new account (no row yet) with > 3     -> refused (unchanged)
--
-- profile_row_exists() is SECURITY DEFINER (035) so the existence check does
-- not depend on RLS; this function stays SECURITY INVOKER so the
-- `current_user` exemption below still means what it says.

create or replace function public.enforce_free_tier_target_limit()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  limit_for_free constant int := 3;
  new_count int;
begin
  if current_user in ('service_role', 'postgres') then
    return new;
  end if;

  new_count := coalesce(array_length(new.target_school_slugs, 1), 0);

  -- has_tier('player') is true for player AND family.
  if new_count > limit_for_free and not public.has_tier('player') then
    -- The INSERT half of an upsert on a row that already exists: not an
    -- account creation. The UPDATE half re-runs this check with OLD.
    if tg_op = 'INSERT' and public.profile_row_exists(new.id) then
      return new;
    end if;

    -- Never block a save that does not ADD schools. An account over the
    -- limit (e.g. downgraded from Player, or saved before 024) keeps its
    -- list, can save anything else, and can prune one school at a time.
    if tg_op = 'UPDATE'
       and new_count <= coalesce(array_length(old.target_school_slugs, 1), 0)
    then
      return new;
    end if;

    raise exception
      'Free accounts can track up to % target schools. Upgrade to Player to track more.',
      limit_for_free
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

-- create or replace keeps existing grants; repeated so the file is correct
-- on its own.
revoke all on function public.enforce_free_tier_target_limit() from public;

-- ---------------------------------------------------------------------------
-- VERIFICATION (as a real Free user: set local role authenticated + claims)
-- ---------------------------------------------------------------------------
-- With a Free user holding 5 targets, each in its own savepoint:
--   upsert the same 5            -> succeeds   (was 23514)
--   upsert 4 of them             -> succeeds   (was 23514)
--   update name only             -> succeeds
--   upsert 6                     -> 23514
-- With a Free user holding 3:
--   upsert 4                     -> 23514
-- A paid user upserting 8        -> succeeds
--
-- ROLLBACK: re-run the `create or replace function` block from
-- 024_tier_gating_outreach_player_free_targets.sql verbatim. Nothing else
-- changes here; the trigger itself is untouched.
